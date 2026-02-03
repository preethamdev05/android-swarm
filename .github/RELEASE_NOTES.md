# Release Notes

## v0.1.0-stable (February 3, 2026)

### Production Stability Release

First production-ready release with comprehensive audit fixes and API migration.

### Critical Fixes

**Token Accounting (BLOCKER)**
- Token usage now extracted from LLM responses
- Accurate tracking in database
- 200k token limit enforcement functional
- All agents (Planner/Coder/Critic/Verifier) return usage data

**Signal Handling (MAJOR)**
- Removed `process.exit()` from SIGINT/SIGTERM handlers
- Finally blocks execute reliably
- PID file cleanup guaranteed
- Graceful shutdown implemented

**File Size Enforcement (MAJOR)**
- 50KB limit enforced at write time
- Warnings at 80% threshold (40KB)
- Prevents workspace bloat
- Rejects malformed oversized files

**Transaction Safety (MAJOR)**
- Atomic `createTask` with workspace creation
- DB rollback on filesystem failure
- No orphaned database records
- Consistent DB-filesystem state

### Enhancements

**Observability**
- Real-time step progress: "Step 5/25 (20%)"
- Phase timing metrics
- Token usage per agent
- Duration tracking per step

**API Migration**
- Google Gemini API integration (gemini-1.5-pro)
- Replaces NVIDIA NIM (unresponsive)
- Replaces Moonshot (accessibility issues)
- Free tier: 15 RPM, 1M TPM, 1,500 req/day
- API key: https://aistudio.google.com/app/apikey

**Documentation**
- Comprehensive README updates
- Token accounting explained
- Progress logging documented
- Troubleshooting expanded
- API migration guide

### Breaking Changes

None. All changes are non-breaking and additive.

### Migration Guide

**API Key Update Required:**

```bash
# Old (NVIDIA NIM or Moonshot)
export KIMI_API_KEY="nvapi-..." or "sk-..."

# New (Google Gemini)
export KIMI_API_KEY="AIzaSy..."
# Get from: https://aistudio.google.com/app/apikey
```

Variable name unchanged for compatibility.

### Verification

```bash
# Test basic execution
export KIMI_API_KEY="AIzaSy..."
node dist/index.js agent --message 'build app: {...}'

# Verify token tracking
sqlite3 ~/.openclaw/swarm.db "SELECT total_tokens FROM tasks ORDER BY created_at DESC LIMIT 1;"

# Verify graceful shutdown
node dist/index.js agent --message '...'
# Press Ctrl+C - should see cleanup logs
```

### Known Issues

None identified.

### Upgrade Instructions

```bash
git pull origin main
npm install  # No new dependencies
npm run build
# Update KIMI_API_KEY to Gemini API key
```

### Contributors

- preethamdev05

### Commit Range

a855e6c..b331c5e (13 commits)
