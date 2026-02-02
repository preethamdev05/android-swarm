import Database from 'better-sqlite3';
import { TaskSpec, Step, CriticIssue, TaskState, VerifierOutput } from './types.js';
import { PATHS } from './constants.js';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';

export class StateManager {
  private db: Database.Database;

  constructor() {
    this.ensureDirectories();
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
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  private initializeSchema(): void {
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
      mkdirSync(taskDir, { recursive: true });
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
    const row = stmt.get(taskId);
    
    if (!row) return null;

    return {
      ...row,
      task_spec: JSON.parse(row.task_spec as string),
      plan: row.plan ? JSON.parse(row.plan as string) : null
    };
  }

  writeFile(taskId: string, filePath: string, content: string): void {
    const fullPath = join(PATHS.WORKSPACE_ROOT, taskId, filePath);
    const dir = dirname(fullPath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const tmpPath = fullPath + '.tmp';
    writeFileSync(tmpPath, content, 'utf8');
    
    if (existsSync(fullPath)) {
      // Atomic write pattern not fully supported, direct write
      writeFileSync(fullPath, content, 'utf8');
    } else {
      // Rename for atomic write
      require('fs').renameSync(tmpPath, fullPath);
    }
  }

  readFile(taskId: string, filePath: string): string {
    const fullPath = join(PATHS.WORKSPACE_ROOT, taskId, filePath);
    return readFileSync(fullPath, 'utf8');
  }

  getAllFiles(taskId: string): string[] {
    const taskDir = join(PATHS.WORKSPACE_ROOT, taskId);
    const files: string[] = [];

    const walk = (dir: string, base: string = '') => {
      const entries = require('fs').readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
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
