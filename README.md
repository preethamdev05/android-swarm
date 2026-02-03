# Android Swarm

Android app generation swarm orchestrator for OpenClaw - Termux/Ubuntu compatible agent system with Moonshot Kimi API integration.

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

## Requirements

### Environment

- **Host**: Android device running Termux (proot Ubuntu userspace)
- **Node.js**: >= 22.0.0
- **CPU**: ARM64 or ARMv7
- **Memory**: 2-4GB RAM
- **Storage**: Minimum 100MB free space

### API Access

- Moonshot Kimi API key (set as `KIMI_API_KEY` environment variable)
- Get your API key: https://platform.moonshot.cn/console/api-keys

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
export KIMI_API_KEY="sk-..."
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

### Hard Caps

- **API Calls**: 80 per task
- **Total Tokens**: 200,000 per task
- **Wall-Clock Timeout**: 90 minutes
- **Step Retries**: 3 per step
- **Plan Size**: 25 steps maximum
- **File Size**: 50KB per generated file

### Circuit Breakers

- **Consecutive Failures**: Aborts after 3 consecutive step failures
- **API Error Rate**: Aborts after 5 API errors within 60 seconds

### Emergency Stop

Create this file to abort all running tasks:

```bash
touch ~/.openclaw/workspace/android-swarm/EMERGENCY_STOP
```

## Logging

Logs are written to:

```
~/.openclaw/logs/swarm-<date>.log
```

Log levels:

- **ERROR**: Task aborts, critical failures
- **WARN**: Retries, recoverable issues
- **INFO**: Task lifecycle events
- **DEBUG**: API request/response details (enable with `SWARM_DEBUG=1`)

## Database

Task state is persisted in SQLite:

```
~/.openclaw/swarm.db
```

Tables:

- `tasks`: Task records and metadata
- `steps`: Step execution history
- `api_calls`: API usage audit trail

## Troubleshooting

### "KIMI_API_KEY environment variable is required"

Set the API key:

```bash
export KIMI_API_KEY="sk-..."
```

Get your API key from: https://platform.moonshot.cn/console/api-keys

### "Another task is running"

Only one task can run at a time. Abort the running task or wait for completion.

### "Insufficient disk space"

Free up at least 100MB in Termux home directory.

### "API call limit exceeded"

Task exceeded 80 API calls. Review task complexity or simplify features.

### "Token limit exceeded"

Task exceeded 200,000 tokens. Reduce number of features or split into multiple tasks.

### "Wall-clock timeout"

Task took longer than 90 minutes. Review task complexity.

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
  kimi-client.ts    # Moonshot Kimi API client
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

This system uses Moonshot Kimi API:

- **Endpoint**: `https://api.moonshot.cn/v1/chat/completions`
- **Model**: `moonshot-v1-128k`
- **Authentication**: Bearer token (sk-* format)
- **Default Timeout**: 120 seconds

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
- Provide real-time progress UI
- Support cloud services
- Generate documentation
- Support rollback/undo
- Support multi-user collaboration

## License

MIT
