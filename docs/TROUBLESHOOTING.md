# Troubleshooting Guide

## Common Issues

### "KIMI_API_KEY environment variable is required"

**Cause:** API key not set

**Solution:**
```bash
export KIMI_API_KEY="sk-your-key-here"
```

Add to `~/.bashrc` for persistence:
```bash
echo 'export KIMI_API_KEY="sk-your-key-here"' >> ~/.bashrc
source ~/.bashrc
```

### "Another task is running (PID N)"

**Cause:** PID file exists from previous task

**Solutions:**

**If task is actually running:**
```bash
node dist/index.js abort --task-id <task_id>
```

**If no task running (stale PID file):**
```bash
rm ~/.openclaw/swarm.pid
```

### "Insufficient disk space: XMB free, 100MB required"

**Cause:** Less than 100MB free in Termux home

**Solutions:**

1. Clean up old workspaces:
```bash
rm -rf ~/.openclaw/workspace/android-swarm/<old-task-id>
```

2. Clean up old logs:
```bash
rm ~/.openclaw/logs/swarm-*.log
```

3. Clean npm cache:
```bash
npm cache clean --force
```

### "API call limit exceeded"

**Cause:** Task exceeded 80 API calls

**Root Causes:**
- Task specification too complex
- Many steps requiring multiple retries
- Features are too broad or numerous

**Solutions:**

1. Reduce number of features (aim for 3-5)
2. Simplify feature descriptions
3. Use standard architecture patterns
4. Check logs to see which steps are failing

### "Token limit exceeded"

**Cause:** Task exceeded 200,000 tokens

**Root Causes:**
- Too many features
- Generated files are very large
- Many retry attempts

**Solutions:**

1. Reduce feature count
2. Split into multiple tasks
3. Simplify architecture
4. Review Planner output for overly detailed plan

### "Wall-clock timeout"

**Cause:** Task took longer than 90 minutes

**Root Causes:**
- API slowness
- Network issues
- Task too complex
- Many retries

**Solutions:**

1. Check network connection
2. Simplify task
3. Retry during off-peak hours
4. Check API status

### "Circuit breaker: consecutive failures"

**Cause:** 3 consecutive steps failed

**Root Causes:**
- Invalid task specification
- API issues
- Systemic problem with Coder or Critic

**Solutions:**

1. Check logs for specific error
2. Validate task specification
3. Try simpler task to isolate issue
4. Check API connectivity

### "Circuit breaker: API error rate"

**Cause:** 5 API errors within 60 seconds

**Root Causes:**
- Network instability
- API service issues
- Rate limiting

**Solutions:**

1. Check network connection
2. Wait and retry later
3. Check Kimi API status
4. Verify API key is valid

### Build Fails After Generation

**Symptom:** `./gradlew assembleDebug` fails

**Common Causes:**

1. **Missing Gradle wrapper:**
   - Check if `gradle/wrapper/gradle-wrapper.jar` exists
   - May need to generate: `gradle wrapper`

2. **Network issues downloading dependencies:**
   - Ensure internet connection
   - Try: `./gradlew build --refresh-dependencies`

3. **Incorrect SDK paths:**
   - Set `ANDROID_HOME` environment variable
   - Point to Android SDK location

4. **Kotlin compilation errors:**
   - Check `app/build/` for error logs
   - Generated code may have issues (rare)
   - Report issue with task ID and error

### Slow Execution

**Symptom:** Task takes very long

**Causes:**

1. **Network latency:**
   - API calls have high RTT
   - Solution: Wait or retry with better connection

2. **CPU throttling:**
   - Android thermal management
   - Solution: Let device cool down

3. **Many retries:**
   - Steps failing repeatedly
   - Solution: Check logs for rejection reasons

4. **Large plan:**
   - Many steps (close to 25)
   - Solution: Normal for complex apps

### Logs Not Written

**Symptom:** No log file in `~/.openclaw/logs/`

**Causes:**

1. **Directory doesn't exist:**
   ```bash
   mkdir -p ~/.openclaw/logs
   ```

2. **Permission issues:**
   ```bash
   chmod 755 ~/.openclaw
   chmod 755 ~/.openclaw/logs
   ```

3. **Disk full:**
   - Free up space

### Node.js Version Issues

**Symptom:** "SyntaxError" or "Unexpected token"

**Cause:** Node.js version <22

**Solution:**

In Termux:
```bash
pkg upgrade
pkg install nodejs
node -v  # Should be v22.x.x or higher
```

### TypeScript Compilation Errors

**Symptom:** `npm run build` fails

**Causes:**

1. **Outdated dependencies:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **TypeScript version mismatch:**
   ```bash
   npm install typescript@latest --save-dev
   ```

## Debugging Tips

### Enable Debug Logging

```bash
export SWARM_DEBUG=1
node dist/index.js agent --message '...'
```

This outputs:
- API request/response bodies
- Detailed state transitions
- Internal operation details

### Check Task State

```bash
sqlite3 ~/.openclaw/swarm.db "SELECT * FROM tasks WHERE task_id='<task-id>'"
```

### Check Step History

```bash
sqlite3 ~/.openclaw/swarm.db "SELECT step_number, attempt, critic_decision FROM steps WHERE task_id='<task-id>'"
```

### Check API Usage

```bash
sqlite3 ~/.openclaw/swarm.db "SELECT agent, SUM(prompt_tokens), SUM(completion_tokens) FROM api_calls WHERE task_id='<task-id>' GROUP BY agent"
```

### View Recent Logs

```bash
tail -f ~/.openclaw/logs/swarm-$(date +%Y-%m-%d).log
```

### Find Failed Tasks

```bash
sqlite3 ~/.openclaw/swarm.db "SELECT task_id, error_message FROM tasks WHERE state='FAILED' ORDER BY start_time DESC LIMIT 10"
```

### Inspect Generated Files

```bash
cd ~/.openclaw/workspace/android-swarm/<task-id>
find . -type f -name '*.kt' | head
```

## Recovery Procedures

### Restart Failed Task

Tasks cannot be resumed. Must start new task with same specification.

### Clean Corrupted Database

**Caution:** This deletes all task history.

```bash
rm ~/.openclaw/swarm.db
```

Database will be recreated on next run.

### Reset Environment

```bash
rm -rf ~/.openclaw
mkdir -p ~/.openclaw/workspace/android-swarm
mkdir -p ~/.openclaw/logs
```

### Emergency Stop All Tasks

```bash
touch ~/.openclaw/workspace/android-swarm/EMERGENCY_STOP
```

Remove after abort:
```bash
rm ~/.openclaw/workspace/android-swarm/EMERGENCY_STOP
```

## Performance Optimization

### Reduce API Calls

1. Use fewer features (3-5 optimal)
2. Choose simpler architecture
3. Use Views instead of Compose (fewer files)
4. Avoid broad feature descriptions

### Reduce Token Usage

1. Keep feature names concise
2. Use standard patterns (less explanation needed)
3. Avoid complex UI requirements

### Speed Up Execution

1. Use fast, stable network
2. Run during off-peak hours
3. Keep device cool (avoid throttling)
4. Close other apps (free memory)

## Getting Help

If issues persist:

1. Check documentation in `docs/`
2. Review example tasks in `examples/`
3. Enable debug logging and inspect output
4. Check SQLite database for task details
5. Collect error logs and task ID for support
