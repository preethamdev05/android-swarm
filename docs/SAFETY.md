# Safety Controls

## Overview

The Android Swarm system includes comprehensive safety controls to prevent runaway execution, excessive API usage, and resource exhaustion in constrained Termux environments.

## Hard Limits

### API Call Cap

**Limit:** 80 API calls per task

**Enforcement:**
- Counter incremented on every Kimi API request
- Checked before each API call
- Stored in SQLite for persistence

**On Exceed:**
- Task aborted immediately
- State set to FAILED
- Error message: "API call limit exceeded"

**Rationale:** Prevents runaway API costs and ensures tasks complete within reasonable bounds.

### Token Cap

**Limit:** 200,000 total tokens (prompt + completion) per task

**Enforcement:**
- Accumulated from `usage` field in API responses
- Checked after each API call
- Stored in SQLite for persistence

**On Exceed:**
- Task aborted immediately
- State set to FAILED
- Error message: "Token limit exceeded"

**Rationale:** Controls API costs and prevents tasks with excessive token consumption.

### Wall-Clock Timeout

**Limit:** 90 minutes (5400 seconds)

**Enforcement:**
- Start time recorded at task creation
- Elapsed time checked before each agent invocation

**On Exceed:**
- Task aborted immediately
- State set to FAILED
- Error message: "Wall-clock timeout"

**Rationale:** Ensures tasks don't run indefinitely; protects against stuck processes.

### Step Retry Cap

**Limit:** 3 attempts per step

**Enforcement:**
- Attempt counter in per-step loop
- Incremented on each Coder invocation

**On Exceed:**
- Step marked as failed
- Task aborted
- Error message: "Step N exceeded retry limit"

**Rationale:** Prevents infinite retry loops on problematic steps.

### Plan Size Cap

**Limit:** 25 steps

**Enforcement:**
- Validated after Planner execution
- Checked during plan validation

**On Exceed:**
- Task aborted
- Error message: "Plan exceeds 25 steps"

**Rationale:** Keeps tasks manageable; larger projects should be split.

### File Size Cap

**Limit:** 50KB per generated file

**Enforcement:**
- Checked after Coder output
- Content truncated if exceeded

**On Exceed:**
- Content truncated to 50KB
- Warning logged
- Execution continues (best-effort)

**Rationale:** Prevents memory exhaustion from extremely large files.

## Circuit Breakers

### Consecutive Failure Breaker

**Trigger:** 3 consecutive step failures

**Tracking:**
- Counter incremented on step failure
- Reset to 0 on successful step

**Action:**
- Task aborted immediately
- Error message: "Circuit breaker: consecutive failures"

**Rationale:** Detects systemic issues (bad task spec, API problems) and fails fast.

### API Error Rate Breaker

**Trigger:** 5 API errors within 60 seconds

**Tracking:**
- Timestamps of API errors stored in array
- Window slides with time
- Errors include: timeout, 500+, network failures

**Action:**
- Task aborted immediately
- Error message: "Circuit breaker: API error rate"

**Rationale:** Detects API instability or network issues; prevents retry storms.

### Critic Rejection Rate (Advisory)

**Trigger:** >50% rejection rate across all steps (minimum 5 steps completed)

**Tracking:**
- Rejection count / total steps
- Calculated during execution

**Action:**
- Warning logged
- Execution continues (advisory only)

**Rationale:** Indicates task complexity or specification issues; informational only.

## Manual Abort Mechanisms

### Signal Handling

**Signals:** SIGINT (Ctrl+C), SIGTERM

**Behavior:**
1. Set abort flag
2. Save current state to SQLite
3. Flush logs
4. Mark task as FAILED
5. Remove PID file
6. Exit process

**Use Case:** User-initiated cancellation during execution.

### CLI Abort Command

**Command:** `node dist/index.js abort --task-id <task_id>`

**Behavior:**
1. Read PID from PID file
2. Send SIGTERM to process
3. Task handles signal as above

**Use Case:** Abort task from separate terminal session.

### Emergency Stop File

**Path:** `~/.openclaw/workspace/android-swarm/EMERGENCY_STOP`

**Behavior:**
1. Checked before each agent invocation
2. If exists, abort task immediately
3. Error message: "Emergency stop"

**Cleanup:** Remove file after abort

**Use Case:** Multi-task scenarios (future extension); immediate halt.

## Termux-Specific Safeguards

### Path Traversal Prevention

**Rule:** All file paths must be relative (no leading `/`, no `..` components)

**Enforcement:**
- Validated during plan validation
- Checked before file write

**On Violation:**
- Task aborted
- Error message: "Path traversal attempt"

**Rationale:** Prevents writing files outside workspace directory.

### Disk Space Check

**Rule:** Minimum 100MB free space before task start

**Enforcement:**
- Checked during task intake
- Uses `statfsSync()` on Termux home

**On Violation:**
- Task refused
- Error message: "Insufficient disk space: XMB free, 100MB required"

**Rationale:** Prevents disk exhaustion; ensures workspace can be written.

### Process Isolation (PID File)

**Rule:** Only one orchestrator process per OpenClaw instance

**Enforcement:**
- PID file created at task start
- Checked before new task starts
- Contains process PID

**On Conflict:**
- New task refused
- Error message: "Another task is running (PID N)"

**Cleanup:** PID file removed on task completion or abort

**Rationale:** Prevents concurrent tasks from interfering; manages resource contention.

### Network Timeout Enforcement

**Rule:** 30-second timeout on all HTTP requests

**Enforcement:**
- AbortSignal with timeout passed to fetch()
- Timeout triggers abort error

**On Timeout:**
- Classified as transient error
- Retry if attempts remain
- Otherwise abort step

**Rationale:** Handles intermittent network in mobile environments.

## CPU Throttling Detection

**Rule:** If step execution time >10x baseline, log warning

**Tracking:**
- Per-agent baseline established on first successful call
- Subsequent calls compared to baseline

**Action:**
- Warning logged
- Execution continues (no abort)

**Rationale:** Detects Android thermal throttling; informational only.

## Memory Management

**Rule:** No operation may allocate >500MB sustained

**Enforcement:**
- Manual monitoring (no automatic enforcement in Node.js)
- Recommendation: Use `--max-old-space-size=512` Node.js flag

**Best Practices:**
- Truncate large API responses
- Clear buffers after file writes
- Avoid caching API responses
- Limit in-memory state size

## Fail-Safe Behaviors

### Critic Failure Handling

**Scenario:** Critic agent crashes or times out

**Behavior:**
- Treat as ACCEPT with warning logged
- Execution continues

**Rationale:** Fail-open policy; prefer progress over perfection.

### Verifier Failure Handling

**Scenario:** Verifier agent crashes or times out

**Behavior:**
- Log warning
- Task completes anyway

**Rationale:** Verifier is advisory only; cannot block completion.

### File Write Failure

**Scenario:** File write operation fails (disk full, permissions)

**Behavior:**
- Exception thrown
- Task aborted
- Error logged

**Rationale:** File integrity is critical; cannot proceed without successful writes.

## Audit and Logging

### API Call Audit Trail

**Storage:** SQLite `api_calls` table

**Fields:**
- task_id
- agent (planner/coder/critic/verifier)
- prompt_tokens
- completion_tokens
- timestamp

**Retention:** Indefinite (manual cleanup)

**Purpose:** Cost tracking, debugging, compliance

### Step Execution History

**Storage:** SQLite `steps` table

**Fields:**
- task_id
- step_number
- file_path
- attempt
- coder_output (truncated for storage)
- critic_decision
- critic_issues (JSON)
- timestamp

**Retention:** Indefinite (manual cleanup)

**Purpose:** Debugging, quality analysis, retry tracking

### Log Files

**Path:** `~/.openclaw/logs/swarm-<date>.log`

**Rotation:** Daily (automatic)

**Retention:** 30 days (manual cleanup)

**Levels:** ERROR, WARN, INFO, DEBUG

**Content:**
- Task lifecycle events
- Agent invocations
- Step outcomes
- Error details
- API request/response (DEBUG only)

**Purpose:** Real-time monitoring, troubleshooting, audit

## Security Considerations

### API Key Protection

- API key loaded from environment variable only
- Never logged or stored in database
- Redacted in error messages

### Generated Code Isolation

- Generated code is never executed by the system
- Output is pure data (files written to disk)
- User must manually build and run APK

### No Remote Code Execution

- System does not eval() or execute generated code
- No shell commands from generated files
- Orchestrator only runs: file I/O, API calls, SQLite

### Workspace Isolation

- All writes confined to task workspace
- Path traversal checks prevent escapes
- No symlink following

## Recommendations

### For Task Authors

1. Start with small feature sets (3-5 features)
2. Use standard architectures (MVVM, MVP)
3. Avoid overly complex specifications
4. Monitor API call and token usage
5. Test with simple tasks before complex ones

### For Operators

1. Set `SWARM_DEBUG=1` for first runs
2. Monitor log files for warnings
3. Clean up workspace periodically
4. Check disk space before large tasks
5. Use abort command if task is stuck

### For Termux Users

1. Ensure stable network connection
2. Keep device plugged in (tasks can run 90 minutes)
3. Avoid running during thermal throttling
4. Free up disk space before tasks
5. Use wake lock to prevent sleep
