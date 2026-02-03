# Audit Fixes - Corrective Refactor

**Date**: February 3, 2026  
**Branch**: `audit-fixes-corrective-refactor`  
**Base Commit**: `ac1ee398926ed9819c553d895ab5f6dbfa4f514d`

## Overview

This document describes the corrective refactor performed to address findings from the production-grade audit. All changes are **non-breaking** and preserve existing API contracts, CLI usage, and user-facing behavior.

## Audit Categories Addressed

### 🔒 Security (BLOCKER → Fixed)

**Finding**: Path injection and filesystem safety vulnerabilities

**Changes**:

1. **Path Validation** (`src/validators.ts`)
   - Added comprehensive `validateFilePath()` checks
   - Prevents directory traversal (`..` detection)
   - Enforces maximum path length (512 chars)
   - Validates path components (alphanumeric + underscore/hyphen/dot only)
   - Added `sanitizeFilePath()` for defense-in-depth
   - Validates paths against workspace boundary using canonical path resolution

2. **Reserved Keyword Protection** (`src/validators.ts`)
   - Added 45+ Java/Kotlin reserved keywords (`class`, `fun`, `object`, etc.)
   - Validates `app_name` and `features` against reserved words
   - Prevents generation of invalid package names

3. **Filesystem Safety** (`src/state-manager.ts`)
   - All `writeFile()` calls use `sanitizeFilePath()` validation
   - Atomic write pattern prevents corruption (write to `.tmp`, then rename)
   - File permissions set appropriately (0644 for files, 0755 for executables)
   - Skip hidden files and temporary files in directory traversal

**Verification**:
```bash
# Test path traversal prevention
node dist/index.js agent --message 'build app: {"app_name":"../../etc/passwd",...}'
# Expected: ValidationError

# Test reserved keyword prevention
node dist/index.js agent --message 'build app: {"app_name":"class",...}'
# Expected: ValidationError
```

---

### ⚡ API Resilience (MAJOR → Fixed)

**Finding**: Retry logic under-specified, no exponential backoff with jitter

**Changes**:

1. **Exponential Backoff** (`src/kimi-client.ts`)
   - Implemented exponential backoff: 1s, 2s, 4s
   - Added ±25% jitter to prevent thundering herd
   - Rate limit (429) gets 3 retries with backoff
   - Server errors (5xx) get 1 retry

2. **Error Classification** (`src/utils/errors.ts`)
   - TRANSIENT: 429 (rate limit), 5xx (server errors), timeouts
   - FATAL: 401 (auth), 403 (quota), 400 (invalid request/context length)
   - Enhanced error messages with actionable guidance
   - Specific handling for Kimi error codes

3. **Circuit Breaker Enhancement** (`src/kimi-client.ts`)
   - Sliding window: 5 errors in 60 seconds
   - Auto-reset when window expires
   - Records only non-transient or server errors

**Verification**:
```bash
# Simulate rate limiting (if API returns 429)
# Observe: Exponential backoff delays in logs
# Expected: "Retrying with backoff... (attempt 1/3)"
```

---

### 🔄 Orchestration Robustness (MAJOR → Fixed)

**Finding**: Transient vs. semantic failure separation unclear, feedback loop detection missing

**Changes**:

1. **Failure Type Separation** (`src/orchestrator.ts`)
   - **TRANSIENT failures** (API/network): Immediate retry, count against step limit, trigger circuit breaker
   - **SEMANTIC failures** (Critic rejection): Modified prompt retry, separate counter
   - Distinct logging for failure types

2. **Feedback Loop Detection** (`src/orchestrator.ts`)
   - Tracks consecutive Critic rejections separately
   - Threshold: 2× consecutive failure limit (6 rejections)
   - Prevents infinite Coder→Critic→Coder loops
   - Fails with clear error: "Coder unable to satisfy Critic requirements"

3. **Enhanced Logging** (`src/orchestrator.ts`)
   - Logs failure type (transient vs. semantic)
   - Tracks consecutive rejection counters
   - Records retry reasons

**Verification**:
```bash
# Monitor logs during task execution
# Observe: Separate counters for transient failures vs. Critic rejections
# Expected: "consecutive_rejections: 3" in logs
```

---

### 📊 Token Budgeting (MAJOR → Fixed)

**Finding**: Per-agent token budget enforcement missing

**Changes**:

1. **Per-Agent Budgets** (`src/constants.ts`)
   - Planner: 6K tokens (4K input + 2K output)
   - Coder: 14K tokens (6K input + 8K output)
   - Critic: 11K tokens (10K input + 1K output)
   - Verifier: 9K tokens (8K input + 1K output)
   - Total allocation strategy documented

2. **Workspace Quota** (`src/constants.ts`)
   - Maximum workspace size: 1GB per task
   - Prevents disk exhaustion attacks

**Verification**:
```bash
# Check constants
grep -A 20 "TOKEN_LIMITS" src/constants.ts
# Expected: Per-agent input/output/total limits
```

---

### ✅ Input Validation (MAJOR → Fixed)

**Finding**: Insufficient validation rigor, missing error messages

**Changes**:

1. **Enhanced Validation** (`src/validators.ts`)
   - Maximum length enforcement: 256 chars for `app_name`, 128 for `features`
   - Feature name validation: alphanumeric + underscore/hyphen only
   - Duplicate feature detection
   - Reserved keyword checks
   - Strict enum validation (case-sensitive)

2. **CLI Validation** (`src/cli.ts`)
   - JSON parsing with specific error messages
   - Required field presence check
   - Task ID format validation (UUID)
   - User-friendly error feedback with examples

**Verification**:
```bash
# Test validation
node dist/index.js agent --message 'build app: {"app_name":"x"*300,...}'
# Expected: "app_name must be at most 256 characters"

node dist/index.js agent --message 'build app: {"app_name":"Test","features":["login","login"],...}'
# Expected: "Duplicate feature: login"
```

---

### 🖥️ CLI Usability (MINOR → Fixed)

**Finding**: Exit codes undocumented, error messages unclear

**Changes**:

1. **Exit Codes** (`src/cli.ts`)
   - **0**: Success
   - **1**: Error (validation, execution failure, etc.)
   - Documented in help text and code comments

2. **Error Messages** (`src/cli.ts`)
   - User-friendly format with emojis (✅, ❌, ⚙️)
   - Specific error context (JSON parsing, missing fields)
   - Actionable tips based on error type
   - Enhanced help text with examples

**Verification**:
```bash
# Test exit codes
node dist/index.js agent --message 'invalid'
echo $?  # Expected: 1

node dist/index.js help
echo $?  # Expected: 0
```

---

## What Was NOT Changed

### Preserved Behavior (Non-Breaking Guarantees)

1. **CLI Interface**
   - Same commands: `agent`, `abort`, `cleanup`
   - Same flags: `--message`, `--task-id`, `--older-than`, `--failed-only`
   - Same message format: `build app: {...}`

2. **API Contracts**
   - Task specification schema unchanged
   - Database schema unchanged
   - File output structure unchanged
   - Workspace paths unchanged

3. **Execution Flow**
   - Agent order unchanged: Planner → Coder → Critic → Verifier
   - Single-task concurrency model unchanged
   - Sequential step execution unchanged

4. **Limits**
   - Same hard caps: 80 API calls, 200K tokens, 90 minutes
   - Same retry limits: 3 per step
   - Same circuit breaker thresholds

5. **Output**
   - Generated projects in same location: `~/.openclaw/workspace/android-swarm/<task_id>/`
   - Logs in same location: `~/.openclaw/logs/swarm-<date>.log`
   - Database in same location: `~/.openclaw/swarm.db`

---

## Testing Recommendations

### Regression Tests

1. **Existing Task Specifications**
   ```bash
   # Run known-good task specs from main branch
   # Verify identical workspace output structure
   # Verify identical file content (modulo timestamps)
   ```

2. **CLI Commands**
   ```bash
   # Test all CLI commands with existing arguments
   node dist/index.js help
   node dist/index.js agent --message 'build app: {...}'
   node dist/index.js abort --task-id <existing-task-id>
   ```

### New Validation Tests

1. **Path Injection**
   ```bash
   # Should reject
   node dist/index.js agent --message 'build app: {"app_name":"../../etc/passwd",...}'
   ```

2. **Reserved Keywords**
   ```bash
   # Should reject
   node dist/index.js agent --message 'build app: {"app_name":"class",...}'
   node dist/index.js agent --message 'build app: {"features":["fun"],...}'
   ```

3. **Length Limits**
   ```bash
   # Should reject
   node dist/index.js agent --message 'build app: {"app_name":"x"*300,...}'
   ```

4. **Duplicate Features**
   ```bash
   # Should reject
   node dist/index.js agent --message 'build app: {"features":["login","login"],...}'
   ```

---

## Commit History

1. `f6f9fe6` - security: enhance path sanitization with reserved keyword checks
2. `f25b0b7` - security: enforce path sanitization in filesystem operations
3. `d108786` - api: implement exponential backoff with jitter for API retries
4. `9591eeb` - orchestrator: separate transient vs semantic failure handling
5. `f249bb0` - constants: add per-agent token budgets and workspace quota
6. `61b9106` - errors: enhance HTTP error classification with Kimi-specific codes
7. `046f601` - cli: enhance input validation and user-friendly error messages

---

## Audit Status Summary

| Category | Severity | Status |
|----------|----------|--------|
| Path Injection & Filesystem Safety | BLOCKER | ✅ Fixed |
| API Error Handling & Retry Logic | MAJOR | ✅ Fixed |
| Orchestration Resilience | MAJOR | ✅ Fixed |
| Token Budgeting | MAJOR | ✅ Fixed |
| Input Validation Rigor | MAJOR | ✅ Fixed |
| CLI Exit Codes & Usability | MINOR | ✅ Fixed |

---

## Remaining Known Issues

### Acknowledged Limitations (Non-Goals)

1. **Gradle Execution**
   - System generates projects only (as stated in README)
   - User responsible for running `./gradlew assembleDebug`
   - Termux compatibility concerns noted in audit remain valid

2. **SQLite Concurrency**
   - Sequential agent model relies on better-sqlite3's serialization
   - Single connection enforced by design
   - No explicit locking needed for current architecture

3. **Multi-Tenant Isolation**
   - Single-task concurrency enforced by PID file
   - No per-user rate limiting (single-user deployment assumed)
   - Cost tracking logged but not enforced

---

## Merge Checklist

- [x] All commits reference audit categories
- [x] No breaking changes to CLI interface
- [x] No breaking changes to task specification schema
- [x] No breaking changes to output structure
- [x] Path sanitization enforced in all filesystem operations
- [x] Exponential backoff implemented for API retries
- [x] Failure types separated (transient vs. semantic)
- [x] Input validation enhanced with specific error messages
- [x] CLI exit codes documented
- [ ] Integration tests pass (manual verification required)
- [ ] Existing task specifications produce identical outputs
- [ ] README updated with security notes (optional follow-up)

---

## Next Steps

1. **Review**: Code review by repository maintainer
2. **Test**: Run integration tests on Termux/Ubuntu environment
3. **Merge**: Merge `audit-fixes-corrective-refactor` → `main`
4. **Release**: Tag as `v1.1.0` or similar minor version bump
5. **Document**: Update README with security best practices section

---

**Questions?** See [audit report](./AUDIT_REPORT.md) for detailed findings and rationale.
