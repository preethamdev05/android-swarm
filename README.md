# Android Swarm

Android app generation swarm orchestrator for OpenClaw - Termux/Ubuntu compatible agent system with Google Gemini API integration.

## System Overview

This system generates complete Android applications using a multi-agent architecture coordinated by an orchestrator. It is designed specifically for Termux/Ubuntu environments running on Android devices.

### Architecture

- **Planner Agent**: Creates execution plan from task specification
- **Coder Agent**: Generates Kotlin/XML/Gradle files
- **Critic Agent**: Reviews generated code for quality and correctness
- **Verifier Agent**: Performs final project validation
- **Orchestrator**: Manages agent coordination and task lifecycle

### Key Features

- Single-file Kotlin/Android project generation
- MVVM/MVP/MVI architecture support
- Jetpack Compose and XML Views support
- Automatic code review and retry mechanism
- SQLite-based state persistence
- Comprehensive error handling and circuit breakers
- Real-time progress logging with step counts and timing metrics
- Token usage tracking and enforcement

## Requirements

### Environment

- **Host**: Android device running Termux (proot Ubuntu userspace)
- **Node.js**: >= 22.0.0
- **CPU**: ARM64 or ARMv7
- **Memory**: 2-4GB RAM
- **Storage**: Minimum 100MB free space

### API Access

- **Google Gemini API key** (set as `KIMI_API_KEY` environment variable)
- Get your free API key: https://aistudio.google.com/app/apikey

**Note**: The environment variable name `KIMI_API_KEY` is preserved for backward compatibility, but this system uses **Google Gemini API**, not Moonshot/Kimi API. Ensure you obtain a Gemini API key from Google AI Studio.

## Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Set Environment Variables

```bash
# Set your Google Gemini API key
export KIMI_API_KEY="AIzaSy..."  # Note: Expects Gemini API key despite variable name
```

Optional variables:

```bash
export SWARM_DEBUG=1                    # Enable debug logging
export SWARM_API_TIMEOUT=120            # API timeout in seconds (default: 120)
export SWARM_WORKSPACE_ROOT=~/.openclaw/workspace/android-swarm
```

## Usage

### Generate Android App

```bash
node dist/index.js agent --message 'build app: {"app_name":"MyApp","features":["login","list","detail"],"architecture":"MVVM","ui_system":"Compose","min_sdk":24,"target_sdk":34,"gradle_version":"8.2.0","kotlin_version":"1.9.20"}'
```

Strict verification mode (fails the task if verification quality < 0.5):

```bash
node dist/index.js agent --strict-verification --message 'build app: {"app_name":"MyApp","features":["login","list","detail"],"architecture":"MVVM","ui_system":"Compose","min_sdk":24,"target_sdk":34,"gradle_version":"8.2.0","kotlin_version":"1.9.20"}'
```

### Task Specification

Required fields:

- `app_name`: Alphanumeric + underscore only
- `features`: Array of 1-10 feature names
- `architecture`: "MVVM", "MVP", or "MVI"
- `ui_system`: "Views" or "Compose"
- `min_sdk`: Integer 21-34
- `target_sdk`: Integer >= min_sdk, <= 34
- `gradle_version`: Semantic version (e.g., "8.2.0")
- `kotlin_version`: Semantic version (e.g., "1.9.20")

### Example Task Specifications

**Simple Todo App (Compose)**

```bash
node dist/index.js agent --message 'build app: {"app_name":"TodoApp","features":["add_task","list_tasks","complete_task"],"architecture":"MVVM","ui_system":"Compose","min_sdk":24,"target_sdk":34,"gradle_version":"8.2.0","kotlin_version":"1.9.20"}'
```

**E-commerce App (Views)**

```bash
node dist/index.js agent --message 'build app: {"app_name":"ShopApp","features":["product_list","product_detail","cart","checkout"],"architecture":"MVP","ui_system":"Views","min_sdk":21,"target_sdk":33,"gradle_version":"8.1.0","kotlin_version":"1.9.10"}'
```

### Abort Running Task

```bash
node dist/index.js abort --task-id <task_id>
```

### Cleanup Old Tasks

```bash
node dist/index.js cleanup --older-than 7d --failed-only
```

### Local Read-Only UI

Start the local monitoring UI (read-only, polling, no agent execution):

```bash
node dist/index.js ui --port 4317
```

Then open: `http://127.0.0.1:4317`

## Output

### Workspace Structure

Generated projects are stored at:

```
~/.openclaw/workspace/android-swarm/<task_id>/
```

Each project contains:

```
app/
  src/
    main/
      java/com/example/<app_name>/
        MainActivity.kt
        ...
      res/
        layout/
        values/
      AndroidManifest.xml
  build.gradle.kts
build.gradle.kts
settings.gradle.kts
gradle.properties
gradle/
  wrapper/
    gradle-wrapper.properties
    gradle-wrapper.jar
```

### Building Generated App

```bash
cd ~/.openclaw/workspace/android-swarm/<task_id>/
./gradlew assembleDebug
```

The APK will be generated at:

```
app/build/outputs/apk/debug/app-debug.apk
```

## Limits and Safety Controls

### Hard Caps (Enforced)

- **API Calls**: 80 per task (enforced via database tracking)
- **Total Tokens**: 200,000 per task (enforced via token accounting from LLM responses)
- **Wall-Clock Timeout**: 90 minutes (enforced via timer)
- **Step Retries**: 3 per step (enforced per step)
- **Plan Size**: 25 steps maximum (enforced during plan validation)
- **File Size**: 50KB per generated file (enforced before disk write)

**Token Limit Enforcement**: Token usage is extracted from LLM API responses (prompt_tokens + completion_tokens) and accumulated in the database. When total_tokens reaches 200,000, task execution is aborted with `LimitExceededError`.

### Circuit Breakers

- **Consecutive Failures**: Aborts after 3 consecutive step failures
- **API Error Rate**: Aborts after 5 API errors within 60 seconds
- **Feedback Loop Detection**: Aborts after 6 consecutive Critic rejections

### Emergency Stop

Create this file to abort all running tasks:

```bash
touch ~/.openclaw/workspace/android-swarm/EMERGENCY_STOP
```

### Signal Handling

Graceful shutdown on SIGINT/SIGTERM:
- PID file cleanup guaranteed
- Database connection closed properly
- Task state marked as FAILED
- Finally blocks execute reliably

## Termux Notes & Limitations

- The UI binds only to `127.0.0.1` for local access.
- Keep the Termux/proot session active while running the UI or agent.
- The UI is read-only (status, logs, files, progress, heartbeat) and uses polling only.

## Progress and Observability

### Real-Time Progress Logging

During execution, the system logs:

- **Step Progress**: "Step 5/25 (20%) completed"
- **Phase Timing**: Planning, execution, verification durations
- **Step Duration**: Individual step execution time
- **Token Usage**: Cumulative token consumption per agent

Example log output:

```
[INFO] Executing step { step: 5, progress: "5/25", progress_percent: 20, file: "MainActivity.kt" }
[INFO] Step completed { step: 5, progress: "5/25 (20%)", duration_ms: 8432 }
[INFO] Execution phase complete { total_steps: 25, duration_ms: 180245, duration_min: 3 }
```

## Logging

Logs are written to:

```
~/.openclaw/logs/swarm-<date>.log
```

Log levels:

- **ERROR**: Task aborts, critical failures
- **WARN**: Retries, recoverable issues, file size warnings
- **INFO**: Task lifecycle events, progress updates, phase timing
- **DEBUG**: API request/response details (enable with `SWARM_DEBUG=1`)

## Database

Task state is persisted in SQLite:

```
~/.openclaw/swarm.db
```

Tables:

- `tasks`: Task records, metadata, token counts
- `steps`: Step execution history
- `api_calls`: API usage audit trail with token usage

## Troubleshooting

### "KIMI_API_KEY environment variable is required"

Set the **Gemini API key** (environment variable name is `KIMI_API_KEY` for compatibility):

```bash
export KIMI_API_KEY="AIzaSy..."
```

Get your free API key from: https://aistudio.google.com/app/apikey

**Important**: This system uses Google Gemini API. Ensure you obtain a Gemini API key, not Moonshot/Kimi API key.

### "Another task is running"

Only one task can run at a time. Abort the running task or wait for completion.

### "Insufficient disk space"

Free up at least 100MB in Termux home directory.

### "API call limit exceeded"

Task exceeded 80 API calls. Review task complexity or simplify features.

### "Token limit exceeded"

Task exceeded 200,000 tokens. This limit is now enforced via token accounting:
- Token usage is extracted from LLM responses
- Accumulated in database per task
- Task aborts when limit is reached

To resolve:
- Reduce number of features
- Split into multiple smaller tasks
- Simplify feature descriptions

### "Wall-clock timeout"

Task took longer than 90 minutes. Review task complexity.

### "Quota exceeded" or "Rate limit"

Gemini free tier limits:
- 15 requests per minute
- 1 million tokens per minute
- 1,500 requests per day

Wait a few minutes and retry, or upgrade to paid tier.

### "File size exceeds limit"

Generated file exceeds 50KB limit. This is enforced before disk write to prevent:
- Workspace bloat
- Malformed generated code
- API response corruption

File size warnings are logged when file approaches 80% of limit (40KB).

## Development

### Project Structure

```
src/
  agents/
    planner.ts      # Plan generation
    coder.ts        # Code generation
    critic.ts       # Code review
    verifier.ts     # Project validation
  orchestrator.ts   # Task coordination
  state-manager.ts  # SQLite and filesystem
  kimi-client.ts    # Gemini API client
  validators.ts     # Input validation
  coding-profile.ts # Kotlin/Android standards
  logger.ts         # Logging utility
  cli.ts            # CLI interface
  index.ts          # Entry point
  types.ts          # TypeScript types
  constants.ts      # Configuration
```

### Build and Run

```bash
npm run build
node dist/index.js agent --message '...'
```

### Development Mode

```bash
npm run dev  # Watch mode
```

## API Integration

This system uses **Google Gemini API**:

- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent`
- **Model**: `gemini-1.5-pro` (128k context window)
- **Authentication**: API key in URL query parameter
- **Default Timeout**: 120 seconds
- **Free Tier**: 15 RPM, 1M TPM, 1,500 requests/day

**Token Usage Tracking**: The system extracts token usage from API responses:
```typescript
response.usage.prompt_tokens      // Input tokens
response.usage.completion_tokens  // Output tokens
```
These values are recorded in the database and used for limit enforcement.

## Non-Goals

The system explicitly does NOT:

- Execute Gradle builds
- Run Android emulator or devices
- Generate unit tests
- Integrate with IDEs
- Support incremental updates
- Support multi-session continuation
- Execute generated code
- Support multiple model providers
- Provide real-time progress UI (only logs)
- Support cloud services
- Generate documentation
- Support rollback/undo
- Support multi-user collaboration

## License

MIT
