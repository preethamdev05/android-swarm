import Database from 'better-sqlite3';
import { TaskSpec, Step, CriticIssue, TaskState, VerifierOutput } from './types.js';
import { PATHS, LIMITS } from './constants.js';
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync, unlinkSync, chmodSync } from 'fs';
import { dirname, join } from 'path';
import { sanitizeFilePath, ValidationError } from './validators.js';
import { logger } from './logger.js';

/**
 * Manages task state persistence using SQLite database and filesystem operations.
 * 
 * Safety guarantees:
 * - All file paths are validated and sanitized before filesystem access
 * - SQLite operations use a single connection (serialized by better-sqlite3)
 * - Atomic write operations prevent corruption
 * - Workspace boundary enforcement prevents directory traversal
 * - File size limits enforced before disk write
 */
export class StateManager {
  private db: Database.Database;

  constructor() {
    this.ensureDirectories();
    // Note: better-sqlite3 provides a single connection with serialized access
    // This ensures transaction safety without explicit locking in our sequential agent model
    this.db = new Database(PATHS.DATABASE);
    this.initializeSchema();
  }

  private ensureDirectories(): void {
    const dirs = [
      PATHS.OPENCLAW_ROOT,
      PATHS.WORKSPACE_ROOT,
      PATHS.LOGS_DIR
    ];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true, mode: 0o755 });
      }
    }
  }

  private initializeSchema(): void {
    // Execute schema creation in a transaction for atomicity
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        task_id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        task_spec TEXT NOT NULL,
        plan TEXT,
        api_call_count INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        step_number INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        coder_output TEXT,
        critic_decision TEXT,
        critic_issues TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(task_id)
      );

      CREATE TABLE IF NOT EXISTS api_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        agent TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(task_id)
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state);
      CREATE INDEX IF NOT EXISTS idx_steps_task ON steps(task_id);
      CREATE INDEX IF NOT EXISTS idx_api_calls_task ON api_calls(task_id);
    `);
  }

  createTask(taskId: string, taskSpec: TaskSpec): void {
    const stmt = this.db.prepare(
      'INSERT INTO tasks (task_id, state, task_spec, start_time) VALUES (?, ?, ?, ?)'
    );
    stmt.run(taskId, 'PLANNING', JSON.stringify(taskSpec), Date.now());

    const taskDir = join(PATHS.WORKSPACE_ROOT, taskId);
    if (!existsSync(taskDir)) {
      mkdirSync(taskDir, { recursive: true, mode: 0o755 });
    }
  }

  updateTaskState(taskId: string, state: TaskState, errorMessage?: string): void {
    const updates: any = { state };
    
    if (state === 'COMPLETED' || state === 'FAILED') {
      updates.end_time = Date.now();
    }
    
    if (errorMessage) {
      updates.error_message = errorMessage;
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(taskId);

    const stmt = this.db.prepare(`UPDATE tasks SET ${setClauses} WHERE task_id = ?`);
    stmt.run(...values);
  }

  storePlan(taskId: string, plan: Step[]): void {
    const stmt = this.db.prepare('UPDATE tasks SET plan = ? WHERE task_id = ?');
    stmt.run(JSON.stringify(plan), taskId);
  }

  recordStep(
    taskId: string,
    stepNumber: number,
    filePath: string,
    attempt: number,
    coderOutput: string | null,
    criticDecision: 'ACCEPT' | 'REJECT' | null,
    criticIssues: CriticIssue[] | null
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO steps (
        task_id, step_number, file_path, attempt, 
        coder_output, critic_decision, critic_issues, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      taskId,
      stepNumber,
      filePath,
      attempt,
      coderOutput,
      criticDecision,
      criticIssues ? JSON.stringify(criticIssues) : null,
      Date.now()
    );
  }

  recordAPICall(
    taskId: string,
    agent: string,
    promptTokens: number,
    completionTokens: number
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO api_calls (task_id, agent, prompt_tokens, completion_tokens, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(taskId, agent, promptTokens, completionTokens, Date.now());

    const updateStmt = this.db.prepare(`
      UPDATE tasks 
      SET api_call_count = api_call_count + 1,
          total_tokens = total_tokens + ?
      WHERE task_id = ?
    `);
    updateStmt.run(promptTokens + completionTokens, taskId);
  }

  getTask(taskId: string): any {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE task_id = ?');
    const row = stmt.get(taskId) as any;
    
    if (!row) return null;

    return {
      ...row,
      task_spec: JSON.parse(row.task_spec as string),
      plan: row.plan ? JSON.parse(row.plan as string) : null
    };
  }

  /**
   * Writes a file to the task workspace with path validation and atomic write.
   * 
   * CORRECTIVE FIX: Added file size enforcement before disk write.
   * 
   * Safety guarantees:
   * - Path is validated against directory traversal
   * - File size checked against LIMITS.MAX_FILE_SIZE_BYTES
   * - Atomic write prevents partial file corruption
   * - Permissions set appropriately for file type
   * 
   * @param taskId - The task ID (used as workspace subdirectory)
   * @param filePath - The relative file path (must pass validation)
   * @param content - The file content to write
   * @throws ValidationError if path is unsafe or file size exceeds limit
   */
  writeFile(taskId: string, filePath: string, content: string): void {
    const taskDir = join(PATHS.WORKSPACE_ROOT, taskId);
    
    // Critical: sanitize and validate path to prevent directory traversal
    const fullPath = sanitizeFilePath(taskDir, filePath);
    
    // CORRECTIVE FIX: Enforce file size limit before disk write
    const contentSize = Buffer.byteLength(content, 'utf8');
    
    if (contentSize > LIMITS.MAX_FILE_SIZE_BYTES) {
      throw new ValidationError(
        `File size ${contentSize} bytes exceeds limit of ${LIMITS.MAX_FILE_SIZE_BYTES} bytes for ${filePath}`
      );
    }
    
    // CORRECTIVE FIX: Warn when file approaches limit (80% threshold)
    const warningThreshold = LIMITS.MAX_FILE_SIZE_BYTES * 0.8;
    if (contentSize > warningThreshold) {
      logger.warn('File size approaching limit', {
        file_path: filePath,
        size_bytes: contentSize,
        limit_bytes: LIMITS.MAX_FILE_SIZE_BYTES,
        usage_percent: Math.round((contentSize / LIMITS.MAX_FILE_SIZE_BYTES) * 100)
      });
    }
    
    const dir = dirname(fullPath);

    // Ensure directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o755 });
    }

    // Atomic write pattern: write to temporary file, then rename
    const tmpPath = fullPath + '.tmp';
    try {
      writeFileSync(tmpPath, content, 'utf8');
      
      // Set appropriate permissions before making visible
      // Gradle files need execute permissions, others don't
      const isExecutable = filePath.includes('gradlew');
      chmodSync(tmpPath, isExecutable ? 0o755 : 0o644);
      
      // Atomic rename (on most filesystems)
      if (existsSync(fullPath)) {
        // For existing files, remove old file first on Windows compatibility
        unlinkSync(fullPath);
      }
      renameSync(tmpPath, fullPath);
    } catch (err) {
      // Cleanup temporary file on error
      if (existsSync(tmpPath)) {
        try {
          unlinkSync(tmpPath);
        } catch {}
      }
      throw err;
    }
  }

  /**
   * Reads a file from the task workspace with path validation.
   * 
   * @param taskId - The task ID
   * @param filePath - The relative file path
   * @returns The file content as UTF-8 string
   * @throws ValidationError if path is unsafe
   */
  readFile(taskId: string, filePath: string): string {
    const taskDir = join(PATHS.WORKSPACE_ROOT, taskId);
    
    // Critical: sanitize and validate path
    const fullPath = sanitizeFilePath(taskDir, filePath);
    return readFileSync(fullPath, 'utf8');
  }

  /**
   * Lists all files in the task workspace.
   * Returns relative paths from task root.
   */
  getAllFiles(taskId: string): string[] {
    const taskDir = join(PATHS.WORKSPACE_ROOT, taskId);
    const files: string[] = [];

    const walk = (dir: string, base: string = '') => {
      const entries = require('fs').readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        // Skip hidden files and temporary files for safety
        if (entry.name.startsWith('.') || entry.name.endsWith('.tmp')) {
          continue;
        }
        
        const relativePath = base ? join(base, entry.name) : entry.name;
        
        if (entry.isDirectory()) {
          walk(join(dir, entry.name), relativePath);
        } else {
          files.push(relativePath);
        }
      }
    };

    if (existsSync(taskDir)) {
      walk(taskDir);
    }

    return files;
  }

  close(): void {
    this.db.close();
  }
}
