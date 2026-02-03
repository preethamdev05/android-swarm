import express, { type Request, type Response } from 'express';
import { PATHS } from './constants.js';
import { StateManager } from './state-manager.js';
import { inspectPidFile } from './utils/pid.js';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { logger } from './logger.js';

const HTML_TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Android Swarm UI</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #0f1115;
        color: #f5f5f5;
      }
      body {
        margin: 0;
        padding: 24px;
      }
      h1 {
        margin-bottom: 8px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 16px;
      }
      .card {
        background: #1a1f2b;
        border-radius: 12px;
        padding: 16px;
        border: 1px solid #2c3342;
      }
      .label {
        font-size: 12px;
        text-transform: uppercase;
        color: #8aa0b6;
        margin-bottom: 6px;
      }
      .value {
        font-size: 14px;
        word-break: break-word;
      }
      button {
        background: #2a4cff;
        border: none;
        padding: 8px 12px;
        border-radius: 8px;
        color: white;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      textarea, pre {
        width: 100%;
        min-height: 220px;
        background: #0b0d13;
        color: #e8ecf1;
        border: 1px solid #2c3342;
        border-radius: 8px;
        padding: 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 12px;
        overflow: auto;
        white-space: pre-wrap;
      }
      ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      li {
        padding: 6px 0;
        border-bottom: 1px solid #2c3342;
        cursor: pointer;
      }
      .status-pill {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        background: #2c3342;
        font-size: 12px;
      }
      .muted {
        color: #8aa0b6;
      }
    </style>
  </head>
  <body>
    <h1>Android Swarm UI</h1>
    <p class="muted">Read-only monitoring. Polling every 5 seconds. Bound to 127.0.0.1.</p>

    <div class="grid">
      <div class="card">
        <div class="label">Task Status</div>
        <div class="value" id="task-status">Loading...</div>
        <div class="label">Task ID</div>
        <div class="value" id="task-id">-</div>
        <div class="label">App Name</div>
        <div class="value" id="task-app">-</div>
        <div class="label">PID</div>
        <div class="value" id="pid-status">-</div>
      </div>
      <div class="card">
        <div class="label">Progress</div>
        <div class="value" id="task-progress">-</div>
        <div class="label">Last Step</div>
        <div class="value" id="task-step">-</div>
        <div class="label">Heartbeat</div>
        <div class="value" id="heartbeat-status">-</div>
      </div>
      <div class="card">
        <div class="label">Workspace Files</div>
        <div class="value muted">Click a file to preview.</div>
        <ul id="file-list"></ul>
      </div>
    </div>

    <div class="grid" style="margin-top: 16px;">
      <div class="card">
        <div class="label">File Preview</div>
        <pre id="file-preview">Select a file to view contents.</pre>
      </div>
      <div class="card">
        <div class="label">Recent Logs</div>
        <pre id="log-output">Loading logs...</pre>
      </div>
    </div>

    <script src="/app.js"></script>
  </body>
</html>
`;

const APP_JS = `
const state = {
  taskId: null
};

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(\`Request failed: \${response.status}\`);
  }
  return response.json();
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
}

async function loadStatus() {
  const status = await fetchJson('/api/status');
  const task = status.task;
  const pid = status.pid;

  if (task) {
    state.taskId = task.task_id;
    setText('task-status', task.state || '-');
    setText('task-id', task.task_id || '-');
    setText('task-app', task.task_spec?.app_name || '-');
  } else {
    state.taskId = null;
    setText('task-status', 'No tasks found');
    setText('task-id', '-');
    setText('task-app', '-');
  }

  if (pid?.status === 'active') {
    setText('pid-status', \`Active (PID \${pid.pid})\`);
  } else if (pid?.status) {
    setText('pid-status', pid.status);
  } else {
    setText('pid-status', '-');
  }
}

async function loadProgress() {
  const query = state.taskId ? \`?task_id=\${state.taskId}\` : '';
  const progress = await fetchJson('/api/progress' + query);
  if (!progress || !progress.task_id) {
    setText('task-progress', 'No active task');
    setText('task-step', '-');
    return;
  }
  setText('task-progress', \`\${progress.accepted_steps}/\${progress.total_steps} steps (\${progress.percent}%)\`);
  setText('task-step', progress.latest_step ? \`#\${progress.latest_step}\` : '-');
}

async function loadHeartbeat() {
  const heartbeat = await fetchJson('/api/heartbeat');
  if (!heartbeat || !heartbeat.timestamp) {
    setText('heartbeat-status', 'No heartbeat');
    return;
  }
  const age = heartbeat.age_seconds ?? 0;
  setText('heartbeat-status', \`\${heartbeat.timestamp} (\${age}s ago)\`);
}

async function loadLogs() {
  const logs = await fetchJson('/api/logs');
  setText('log-output', logs.content || 'No logs found');
}

async function loadFiles() {
  if (!state.taskId) {
    const list = document.getElementById('file-list');
    if (list) list.innerHTML = '<li class="muted">No task files</li>';
    return;
  }
  const files = await fetchJson(\`/api/files?task_id=\${state.taskId}\`);
  const list = document.getElementById('file-list');
  if (!list) return;
  list.innerHTML = '';
  if (!files.items || files.items.length === 0) {
    list.innerHTML = '<li class="muted">No files found</li>';
    return;
  }
  files.items.forEach(file => {
    const li = document.createElement('li');
    li.textContent = file;
    li.onclick = () => loadFilePreview(file);
    list.appendChild(li);
  });
}

async function loadFilePreview(path) {
  if (!state.taskId) return;
  const response = await fetchJson(\`/api/file?task_id=\${state.taskId}&path=\${encodeURIComponent(path)}\`);
  setText('file-preview', response.content || '');
}

async function refreshAll() {
  try {
    await Promise.all([
      loadStatus(),
      loadProgress(),
      loadHeartbeat(),
      loadLogs(),
      loadFiles()
    ]);
  } catch (err) {
    setText('task-status', 'Error loading data');
  }
}

refreshAll();
setInterval(refreshAll, 5000);
`;

export interface UIServerOptions {
  port: number;
}

export interface UIServerHandle {
  waitForClose: () => void;
}

function getLatestLogFilePath(): string | null {
  if (!existsSync(PATHS.LOGS_DIR)) {
    return null;
  }

  const files = readdirSync(PATHS.LOGS_DIR)
    .filter(file => file.endsWith('.log'))
    .map(file => ({
      file,
      mtime: statSync(join(PATHS.LOGS_DIR, file)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    return null;
  }

  return join(PATHS.LOGS_DIR, files[0].file);
}

function readLogTail(maxLines: number): string {
  const logPath = getLatestLogFilePath();
  if (!logPath || !existsSync(logPath)) {
    return '';
  }

  const content = readFileSync(logPath, 'utf8');
  const lines = content.split('\\n');
  return lines.slice(-maxLines).join('\\n');
}

export function startUIServer(options: UIServerOptions): UIServerHandle {
  const app = express();
  const stateManager = new StateManager();
  const host = '127.0.0.1';

  app.get('/', (_req: Request, res: Response) => {
    res.type('html').send(HTML_TEMPLATE);
  });

  app.get('/app.js', (_req: Request, res: Response) => {
    res.type('application/javascript').send(APP_JS);
  });

  app.get('/api/status', (_req: Request, res: Response) => {
    const task = stateManager.getLatestTask();
    const pid = inspectPidFile(PATHS.PID_FILE);
    res.json({ task, pid });
  });

  app.get('/api/progress', (req: Request, res: Response) => {
    const taskId = typeof req.query.task_id === 'string' ? req.query.task_id : undefined;
    if (!taskId) {
      res.json({});
      return;
    }

    const task = stateManager.getTask(taskId);
    if (!task) {
      res.json({});
      return;
    }

    const totalSteps = task.plan ? task.plan.length : 0;
    const acceptedSteps = stateManager.getAcceptedStepCount(taskId);
    const latestStep = stateManager.getLatestStepNumber(taskId);
    const percent = totalSteps > 0 ? Math.round((acceptedSteps / totalSteps) * 100) : 0;

    res.json({
      task_id: taskId,
      total_steps: totalSteps,
      accepted_steps: acceptedSteps,
      latest_step: latestStep,
      percent
    });
  });

  app.get('/api/files', (req: Request, res: Response) => {
    const taskId = typeof req.query.task_id === 'string' ? req.query.task_id : undefined;
    if (!taskId) {
      res.json({ items: [] });
      return;
    }
    res.json({ items: stateManager.getAllFiles(taskId) });
  });

  app.get('/api/file', (req: Request, res: Response) => {
    const taskId = typeof req.query.task_id === 'string' ? req.query.task_id : undefined;
    const filePath = typeof req.query.path === 'string' ? req.query.path : undefined;

    if (!taskId || !filePath) {
      res.status(400).json({ error: 'task_id and path are required' });
      return;
    }

    try {
      const content = stateManager.readFile(taskId, filePath);
      res.json({ content });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/logs', (_req: Request, res: Response) => {
    res.json({ content: readLogTail(500) });
  });

  app.get('/api/heartbeat', (_req: Request, res: Response) => {
    if (!existsSync(PATHS.HEARTBEAT_FILE)) {
      res.json({});
      return;
    }

    try {
      const raw = readFileSync(PATHS.HEARTBEAT_FILE, 'utf8');
      const data = JSON.parse(raw);
      const timestamp = data.timestamp;
      const ageSeconds = timestamp ? Math.floor((Date.now() - Date.parse(timestamp)) / 1000) : null;
      res.json({
        timestamp,
        age_seconds: ageSeconds
      });
    } catch (err: any) {
      res.json({ error: err.message });
    }
  });

  const server = app.listen(options.port, host, () => {
    logger.info('UI server listening', { host, port: options.port });
  });

  return {
    waitForClose: () => {
      const handleSignal = () => {
        server.close(() => {
          stateManager.close();
          process.exit(0);
        });
      };
      process.on('SIGINT', handleSignal);
      process.on('SIGTERM', handleSignal);
    }
  };
}
