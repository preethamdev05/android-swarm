# Android Swarm Architecture

## System Components

### Orchestrator

**Responsibilities:**
- Task lifecycle management
- Agent coordination
- State persistence
- Limit enforcement
- Error handling

**Key Operations:**
1. Task intake and validation
2. Planning phase execution
3. Step-by-step execution loop
4. Verification phase
5. Completion/failure handling

### Agents

#### Planner Agent

**Input:** Task specification (JSON)

**Output:** Phased execution plan (1-25 steps)

**Authority:** Single source of truth for task scope

**Execution:** Runs once at task start; failure aborts task

**Phases:**
- **Foundation**: Build files, manifest, project structure
- **Feature**: Core feature implementation
- **Integration**: Navigation, DI, data layer
- **Finalization**: Resources, final configuration

#### Coder Agent

**Input:** Single step + prior files + task spec

**Output:** Complete Kotlin/XML/Gradle file

**Authority:** Code generation only; no planning

**Execution:** Runs once per step; retries up to 3 times on rejection

**Constraints:**
- Must produce syntactically valid file
- Must respect dependencies
- Max 8000 tokens output

#### Critic Agent

**Input:** Generated file + step description + task spec

**Output:** ACCEPT/REJECT decision with issues

**Authority:** Final authority on code quality; can halt execution

**Execution:** Runs once per Coder output; decision is binding

**Rejection Criteria:**
- **BLOCKER**: Syntax errors, missing components, invalid API usage
- **MAJOR**: Architecture violations, missing null checks, poor error handling
- **MINOR**: Verbose code, missing edge cases (logged but accepted)

#### Verifier Agent

**Input:** Complete file tree + task spec

**Output:** Advisory report (warnings, missing items, quality score)

**Authority:** Advisory only; cannot block completion

**Execution:** Runs once after all steps complete

## Data Flow

```
User CLI Input
    ↓
Validation (task spec)
    ↓
Create Task Record (SQLite)
    ↓
Planner Agent → Plan JSON
    ↓
Store Plan (SQLite)
    ↓
FOR EACH STEP:
    ↓
    Coder Agent → File Content
    ↓
    Critic Agent → Decision
    ↓
    IF REJECT: Retry (max 3) OR Abort
    IF ACCEPT: Write File → Next Step
    ↓
END FOR
    ↓
Verifier Agent → Advisory Report
    ↓
Task Complete
    ↓
Output: workspace/<task_id>/
```

## State Management

### In-Memory State (Orchestrator)

```typescript
{
  task_id: string,
  state: TaskState,
  task_spec: TaskSpec,
  plan: Step[] | null,
  current_step_index: number,
  completed_files: string[],
  api_call_count: number,
  total_tokens: number,
  start_time: number,
  last_activity_time: number
}
```

### Persistent State (SQLite)

**Tables:**
- `tasks`: Task records, state, plan, counters, timestamps
- `steps`: Step execution history with attempts and outcomes
- `api_calls`: API usage audit trail with token counts

**Indexes:**
- `idx_tasks_state`: Query tasks by state
- `idx_steps_task`: Query steps by task_id
- `idx_api_calls_task`: Query API calls by task_id

### Filesystem

**Workspace Structure:**
```
~/.openclaw/workspace/android-swarm/<task_id>/
  app/
    src/main/java/...
    src/main/res/...
    src/main/AndroidManifest.xml
    build.gradle.kts
  build.gradle.kts
  settings.gradle.kts
  gradle.properties
  gradle/wrapper/
```

## Execution Lifecycle

### Task States

1. **PLANNING**: Planner agent executing
2. **EXECUTING**: Steps being executed sequentially
3. **VERIFYING**: Verifier agent reviewing project
4. **COMPLETED**: All steps successful
5. **FAILED**: Aborted due to error or limit

### Retry Logic

**Per-Step Retry:**
- Max 3 attempts per step
- Each retry includes prior rejection feedback
- Exceeded limit triggers task abort

**API Retry:**
- 429 (Rate Limit): Exponential backoff (1s, 2s, 4s)
- 500+ (Server Error): Retry once after 5s
- Timeout: Retry if attempts remain
- 400-499 (Client Error): No retry, abort

### Termination Conditions

**Success:**
- All steps executed
- All Critic decisions = ACCEPT
- Verifier completed (even if issues found)

**Failure:**
- Planner produces invalid plan
- Step exceeds 3 retry attempts
- API call limit exceeded (80)
- Token limit exceeded (200,000)
- Wall-clock timeout (90 minutes)
- Circuit breaker triggered
- Emergency stop file detected
- Manual abort signal received

## Safety Architecture

### Hard Limits

- **API Calls**: 80 per task (enforced before each call)
- **Tokens**: 200,000 total (enforced after each call)
- **Wall-Clock**: 90 minutes (enforced before each agent invocation)
- **Step Retries**: 3 per step (enforced in retry loop)
- **Plan Size**: 25 steps (enforced during plan validation)
- **File Size**: 50KB per file (enforced after generation)

### Circuit Breakers

**Consecutive Failures:**
- Trigger: 3 consecutive step failures
- Action: Abort task immediately
- Reset: On successful step

**API Error Rate:**
- Trigger: 5 API errors within 60 seconds
- Action: Abort task immediately
- Reset: Not applicable (task aborted)

### Emergency Controls

**PID File Locking:**
- Only one task runs at a time
- Lock file: `~/.openclaw/swarm.pid`
- Contains process PID for signal delivery

**Emergency Stop File:**
- Path: `~/.openclaw/workspace/android-swarm/EMERGENCY_STOP`
- Checked before each agent invocation
- Presence triggers immediate abort

**Signal Handling:**
- SIGINT (Ctrl+C): Graceful shutdown
- SIGTERM: Graceful shutdown
- Saves state before exit

## API Integration

### Kimi K2.5 Client

**Endpoint:** `https://api.moonshot.cn/v1/chat/completions`

**Authentication:** Bearer token in Authorization header

**Request Format:**
```json
{
  "model": "kimi-k2.5",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "temperature": 0.7
}
```

**Response Format:**
```json
{
  "choices": [
    {"message": {"content": "..."}}
  ],
  "usage": {
    "prompt_tokens": 123,
    "completion_tokens": 456
  }
}
```

**Error Handling:**
- Classify errors as transient or permanent
- Apply retry logic for transient errors
- Abort for permanent errors
- Track error rate for circuit breaker

**Timeout:** 30 seconds per request (enforced via AbortSignal)

## Prompt Engineering

### Planner Prompt Structure

- System: Role definition (planning agent)
- User: Task spec + constraints + output schema
- Output: JSON array of steps (no markdown fences)

### Coder Prompt Structure

- System: Role definition (code generation agent)
- User: File details + task spec + dependencies + coding profile
- Output: Complete file content (no markdown fences)

### Critic Prompt Structure

- System: Role definition (code review agent)
- User: File content + expected outcome + coding profile + rejection criteria
- Output: JSON decision with issues (no markdown fences)

### Verifier Prompt Structure

- System: Role definition (verification agent)
- User: File list + task spec + validation checklist
- Output: JSON report with warnings and quality score (no markdown fences)

## Token Budgets

| Agent | Max Input Tokens | Max Output Tokens |
|-------|------------------|-------------------|
| Planner | 4,000 | 2,000 |
| Coder | 6,000 | 8,000 |
| Critic | 10,000 | 1,000 |
| Verifier | 8,000 | 1,000 |

Exceeding limits aborts the step with error logged.
