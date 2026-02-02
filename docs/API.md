# API Reference

## Task Specification Schema

### TaskSpec

```typescript
interface TaskSpec {
  app_name: string;        // Alphanumeric + underscore only
  features: string[];      // 1-10 feature names
  architecture: 'MVVM' | 'MVP' | 'MVI';
  ui_system: 'Views' | 'Compose';
  min_sdk: number;         // 21-34
  target_sdk: number;      // >= min_sdk, <= 34
  gradle_version: string;  // Semantic version (e.g., "8.2.0")
  kotlin_version: string;  // Semantic version (e.g., "1.9.20")
}
```

### Validation Rules

**app_name:**
- Type: `string`
- Pattern: `/^[a-zA-Z0-9_]+$/`
- Length: 1-50 characters
- Example: `"TodoApp"`, `"My_App_2024"`

**features:**
- Type: `string[]`
- Length: 1-10 items
- Each item: non-empty string
- Example: `["login", "list_items", "detail_view"]`

**architecture:**
- Type: `'MVVM' | 'MVP' | 'MVI'`
- Enum values only
- Example: `"MVVM"`

**ui_system:**
- Type: `'Views' | 'Compose'`
- Enum values only
- Example: `"Compose"`

**min_sdk:**
- Type: `number`
- Range: 21-34 (inclusive)
- Example: `24`

**target_sdk:**
- Type: `number`
- Range: >= min_sdk and <= 34
- Example: `34`

**gradle_version:**
- Type: `string`
- Pattern: `/^\d+\.\d+\.\d+$/`
- Example: `"8.2.0"`

**kotlin_version:**
- Type: `string`
- Pattern: `/^\d+\.\d+\.\d+$/`
- Example: `"1.9.20"`

## CLI Commands

### agent

Execute Android app generation task.

**Syntax:**
```bash
node dist/index.js agent --message 'build app: <spec>'
```

**Arguments:**
- `--message`: Required. Must start with `"build app:"` followed by JSON task specification.

**Example:**
```bash
node dist/index.js agent --message 'build app: {"app_name":"MyApp","features":["login","list"],"architecture":"MVVM","ui_system":"Compose","min_sdk":24,"target_sdk":34,"gradle_version":"8.2.0","kotlin_version":"1.9.20"}'
```

**Output:**
- Task ID (UUID)
- Real-time logs
- Final workspace path on success
- Error message on failure

**Exit Codes:**
- `0`: Success
- `1`: Failure

### abort

Abort running task.

**Syntax:**
```bash
node dist/index.js abort --task-id <task_id>
```

**Arguments:**
- `--task-id`: Required. UUID of task to abort.

**Example:**
```bash
node dist/index.js abort --task-id a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

**Behavior:**
- Sends SIGTERM to running process
- Task gracefully shuts down
- State saved before exit

### cleanup

Clean up old task workspaces.

**Syntax:**
```bash
node dist/index.js cleanup --older-than <duration> [--failed-only]
```

**Arguments:**
- `--older-than`: Required. Duration in days (e.g., `7d`, `30d`)
- `--failed-only`: Optional. Only remove failed tasks

**Example:**
```bash
node dist/index.js cleanup --older-than 7d --failed-only
```

**Note:** Not yet implemented. Placeholder for future extension.

### help

Display usage information.

**Syntax:**
```bash
node dist/index.js help
```

**Output:**
- Command syntax
- Examples
- Environment variables

## Environment Variables

### KIMI_API_KEY

**Required:** Yes

**Description:** Kimi K2.5 API key for authentication

**Format:** `sk-...`

**Example:**
```bash
export KIMI_API_KEY="sk-1234567890abcdef"
```

### SWARM_DEBUG

**Required:** No

**Default:** `0`

**Description:** Enable debug logging

**Values:** `0` (off), `1` (on)

**Example:**
```bash
export SWARM_DEBUG=1
```

### SWARM_API_TIMEOUT

**Required:** No

**Default:** `30`

**Description:** API timeout in seconds

**Range:** 10-120

**Example:**
```bash
export SWARM_API_TIMEOUT=45
```

### SWARM_WORKSPACE_ROOT

**Required:** No

**Default:** `~/.openclaw/workspace/android-swarm`

**Description:** Custom workspace directory

**Example:**
```bash
export SWARM_WORKSPACE_ROOT=/custom/path/workspace
```

## Output Paths

### Workspace

**Path:** `~/.openclaw/workspace/android-swarm/<task_id>/`

**Contents:** Complete Android project

**Structure:**
```
<task_id>/
  app/
    src/main/...
    build.gradle.kts
  build.gradle.kts
  settings.gradle.kts
  gradle.properties
  gradle/wrapper/...
```

### Database

**Path:** `~/.openclaw/swarm.db`

**Format:** SQLite 3

**Tables:** `tasks`, `steps`, `api_calls`

### Logs

**Path:** `~/.openclaw/logs/swarm-<date>.log`

**Format:** Plain text, one line per entry

**Rotation:** Daily

### PID File

**Path:** `~/.openclaw/swarm.pid`

**Contents:** Process ID of running task

**Lifecycle:** Created at task start, removed at task end

## Exit Codes

| Code | Meaning |
|------|----------|
| `0` | Success |
| `1` | General failure (see error message) |

## Error Messages

### Validation Errors

- `"app_name must be alphanumeric + underscore only"`
- `"features must be a non-empty array"`
- `"features array must have at most 10 items"`
- `"architecture must be MVVM, MVP, or MVI"`
- `"ui_system must be Views or Compose"`
- `"min_sdk must be an integer between 21 and 34"`
- `"target_sdk must be >= min_sdk and <= 34"`
- `"gradle_version must be a semantic version string"`
- `"kotlin_version must be a semantic version string"`

### Runtime Errors

- `"KIMI_API_KEY environment variable is required"`
- `"Another task is running (PID N)"`
- `"Insufficient disk space: XMB free, 100MB required"`
- `"API call limit exceeded"`
- `"Token limit exceeded"`
- `"Wall-clock timeout"`
- `"Circuit breaker: consecutive failures"`
- `"Circuit breaker: API error rate"`
- `"Emergency stop"`
- `"Manual abort"`
- `"Path traversal attempt"`

### Plan Validation Errors

- `"Plan must have 1-25 steps"`
- `"Duplicate step_number: N"`
- `"Invalid phase: X"`
- `"Invalid file_path: X"`
- `"Invalid file_type: X"`
- `"Step N has invalid dependency: M"`

## Limits Reference

| Limit | Value | Enforcement |
|-------|-------|-------------|
| API Calls | 80 | Per task |
| Total Tokens | 200,000 | Per task |
| Wall-Clock Timeout | 90 minutes | Per task |
| Step Retries | 3 | Per step |
| Plan Steps | 25 | Per plan |
| File Size | 50KB | Per file |
| Consecutive Failures | 3 | Circuit breaker |
| API Error Rate | 5 in 60s | Circuit breaker |
| Min Disk Space | 100MB | Pre-task check |
