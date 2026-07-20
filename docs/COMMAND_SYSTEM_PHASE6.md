# Command System - Phase 6: Debug & Info

**Status:** ✅ Implemented  
**Version:** 1.0  
**Date:** 2025-01-XX

## Overview

Phase 6 adds comprehensive debugging and monitoring capabilities to CodeBridge, enabling users to troubleshoot issues, monitor performance, and analyze session behavior.

## New Commands

### 1. `/debug on` - Enable Debug Mode

Enable detailed logging for troubleshooting.

**Usage:**
```
/debug on
```

**What it does:**
- Enables detailed operation logging
- Captures all commands, tools, and system events
- Stores logs in memory for quick access
- Logs are kept for 24 hours (configurable)

**Example:**
```
User: /debug on

CodeBridge: ✅ Debug Mode Enabled

All operations will now be logged in detail.

Commands:
  /logs - View debug logs
  /errors - View error history
  /metrics - View session metrics
  /debug off - Disable debug mode

⚠️ Note: Debug logs are kept for 24 hours.
```

---

### 2. `/debug off` - Disable Debug Mode

Disable debug logging and clear log buffer.

**Usage:**
```
/debug off
```

**What it does:**
- Disables debug logging
- Clears in-memory log buffer
- Frees up memory

**Example:**
```
User: /debug off

CodeBridge: ✅ Debug Mode Disabled

Debug logging has been turned off.
Previous logs have been cleared.

Use /debug on to re-enable.
```

---

### 3. `/errors [n]` - Show Error History

Display recent errors with context and timestamps.

**Usage:**
```
/errors          # Show last 10 errors (default)
/errors 20       # Show last 20 errors
/errors 50       # Show last 50 errors (max)
```

**What it shows:**
- Error type (COMMAND_ERROR, TOOL_ERROR, etc.)
- Error message
- Timestamp
- Context (which command/tool caused the error)
- Grouped by session

**Example:**
```
User: /errors 5

CodeBridge: 🚨 Recent Errors (5/12)

*🟢 Current Session*

⚠️ COMMAND_ERROR
   Jan 15, 2:30 PM
   Invalid command syntax
   Command: /search

🔧 TOOL_ERROR
   Jan 15, 2:28 PM
   Bash execution failed: command not found
   Command: /cat

⏱️ TIMEOUT_ERROR
   Jan 15, 2:25 PM
   Operation timed out after 30s

*Session sess_abc123*

💥 SYSTEM_ERROR
   Jan 15, 2:20 PM
   Failed to spawn Claude process

❗ VALIDATION_ERROR
   Jan 15, 2:15 PM
   Invalid file path

... and 7 more errors
Use /errors 12 to see more
```

**Error Types:**
- `COMMAND_ERROR` - Command syntax or execution errors
- `TOOL_ERROR` - Tool execution failures
- `VALIDATION_ERROR` - Input validation failures
- `PERMISSION_ERROR` - Permission denied errors
- `TIMEOUT_ERROR` - Operation timeouts
- `SYSTEM_ERROR` - Internal system errors

---

### 4. `/logs [n]` - Show Debug Logs

Display detailed debug logs (requires debug mode).

**Usage:**
```
/logs            # Show last 50 logs (default)
/logs 100        # Show last 100 logs
/logs 200        # Show last 200 logs (max)
```

**What it shows:**
- Timestamp
- Log level (error, warn, info, debug)
- Log message

**Example with debug mode enabled:**
```
User: /logs 10

CodeBridge: 📋 Debug Logs (Last 10)

✅ 2:30:45 PM - Command executed: /status
🔍 2:30:44 PM - Validating command arguments
ℹ️ 2:30:43 PM - User authenticated: 628xxx
🔍 2:30:42 PM - Parsing command: /status
✅ 2:30:40 PM - Tool execution completed: Read
🔍 2:30:39 PM - Tool started: Read (file: package.json)
⚠️ 2:30:35 PM - Rate limit check: 5/20 calls used
✅ 2:30:30 PM - Session activated: sess_abc123
ℹ️ 2:30:28 PM - Message received from user
❌ 2:30:25 PM - Tool execution failed: Bash

💡 Use /debug off to stop logging
```

**Example without debug mode:**
```
User: /logs

CodeBridge: ⚠️ Debug Mode Disabled

Debug logging is currently disabled.

Enable it with: /debug on

Once enabled, logs will be captured for:
  • Command execution
  • Tool operations
  • System events
```

**Log Levels:**
- ❌ `error` - Error messages
- ⚠️ `warn` - Warning messages
- ℹ️ `info` - Informational messages
- 🔍 `debug` - Detailed debug information
- ✅ `success` - Success messages

---

### 5. `/metrics` - Show Session Metrics

Display comprehensive session statistics and performance metrics.

**Usage:**
```
/metrics
```

**What it shows:**
- Session information (ID, age, last active)
- Command statistics (total, success rate, top commands)
- Tool execution stats (total, success rate, avg duration, top tools)
- Error statistics (total, by type)
- Health score (0-100)

**Example:**
```
User: /metrics

CodeBridge: 📊 Session Metrics

*Session Info*
  ID: sess_abc123
  Created: 2h ago
  Last Active: Just now
  Age: 2h 15m

*Commands*
  Total: 45
  Success: 42
  Failed: 3
  Success Rate: 93%
  Top Commands:
    • /cat (12)
    • /status (8)
    • /tools (6)

*Tool Execution*
  Total: 87
  Success: 82
  Failed: 4
  Cancelled: 1
  Success Rate: 94%
  Avg Duration: 245ms
  Top Tools:
    • Read (28)
    • Write (15)
    • Bash (12)

*Errors*
  Total: 5
  By Type:
    • TOOL_ERROR: 3
    • COMMAND_ERROR: 2

*Health Score:* 🟢 92/100
```

**Health Score:**
- 🟢 90-100: Excellent
- 🟡 70-89: Good
- 🟠 50-69: Fair
- 🔴 0-49: Poor

The health score is calculated based on:
- Command success rate (30% weight)
- Tool success rate (40% weight)
- Error count (30% weight)

---

## Use Cases

### Troubleshooting Command Failures

1. Enable debug mode: `/debug on`
2. Reproduce the issue
3. Check errors: `/errors`
4. Check debug logs: `/logs`
5. Disable debug mode: `/debug off`

### Monitoring Session Performance

Use `/metrics` to:
- Check session health
- Identify frequently used commands/tools
- Monitor success rates
- Spot performance issues

### Understanding Tool Failures

When a tool fails:
1. Check recent errors: `/errors`
2. Look for TOOL_ERROR entries
3. Review context (which command, which tool)
4. Enable debug mode for detailed logs
5. Retry the operation

### Analyzing Session Activity

Use `/metrics` to:
- See which commands you use most
- Identify tool usage patterns
- Track session age and activity
- Monitor overall health

---

## Privacy & Data Retention

### What Gets Logged

**Always logged:**
- Command names and arguments
- Tool names and execution status
- Error messages and types
- Session metadata

**Only with debug mode:**
- Detailed operation logs
- Internal system events
- Timing information

**Never logged:**
- File contents
- WhatsApp message content
- API keys or secrets
- Personal data

### Data Retention

| Data Type | Retention Period | Max Entries |
|-----------|------------------|-------------|
| Debug Logs | 24 hours | 1,000 per user |
| Error History | 30 days | 500 per user |
| Command History | Indefinite* | 100 per user |
| Tool Audit | Indefinite* | 1,000 per user |

*Subject to manual cleanup

**Note:** Data is stored locally in SQLite database and never sent to external servers.

---

## Configuration

Environment variables (`.env`):

```bash
# Debug & Monitoring (Phase 6)
DEBUG_LOG_MAX_ENTRIES=1000           # Max debug log entries per user
DEBUG_LOG_RETENTION_HOURS=24         # Keep debug logs for 24 hours
ERROR_HISTORY_MAX_ENTRIES=500        # Max error entries per user
ERROR_HISTORY_RETENTION_DAYS=30      # Keep errors for 30 days
METRICS_INCLUDE_TOKEN_USAGE=false    # Include token usage (future)
```

---

## Troubleshooting Guide

### Problem: Debug mode won't enable

**Possible causes:**
- No active session
- Database connection issue

**Solution:**
1. Check active session: `/status`
2. Create new session if needed: `/newsession`
3. Try again: `/debug on`

### Problem: No logs showing up

**Possible causes:**
- Debug mode not enabled
- No activity since enabling
- Logs expired (24h retention)

**Solution:**
1. Enable debug mode: `/debug on`
2. Perform some operations
3. Check logs: `/logs`

### Problem: Errors not showing

**Possible causes:**
- No errors occurred
- Errors expired (30d retention)

**Solution:**
1. Check error count: `/errors`
2. If count is 0, no errors occurred
3. Errors are automatically logged when they occur

### Problem: Metrics show unexpected values

**Possible causes:**
- Multiple sessions active
- Old session data

**Solution:**
1. Check active session: `/status`
2. Switch to correct session: `/session <id>`
3. Metrics are per-session, not global

---

## Best Practices

### When to Use Debug Mode

**✅ Enable debug mode when:**
- Troubleshooting an issue
- Reporting a bug
- Learning how CodeBridge works
- Testing new features

**❌ Don't enable debug mode when:**
- Working on sensitive projects
- Running for extended periods (memory usage)
- Everything is working fine

### Monitoring Session Health

- Check `/metrics` periodically
- Keep health score above 70%
- Investigate if success rate drops below 80%
- Review errors regularly

### Performance Tips

- Disable debug mode when not needed (saves memory)
- Review and fix recurring errors
- Monitor tool execution times
- Keep sessions focused (close old sessions)

---

## Examples

### Example 1: Debugging a Failed Command

```
# Enable debug mode
/debug on

# Try the failing command
/search "pattern" invalid/path

# Check what went wrong
/errors

# See detailed logs
/logs 20

# Fix and retry
/search "pattern" src/

# Disable debug mode
/debug off
```

### Example 2: Performance Analysis

```
# Check session metrics
/metrics

# Notice: Read tool used 50 times
# Notice: Average duration: 500ms (seems slow)

# Enable debug mode to investigate
/debug on

# Run a few Read operations
/cat large-file.txt

# Check logs for timing details
/logs

# Identify bottleneck
# Solution: Use smaller files or split operations
```

### Example 3: Error Pattern Analysis

```
# Check recent errors
/errors 20

# Notice: Multiple TOOL_ERROR for Bash
# All from same time period

# Check metrics for more context
/metrics

# See: Tool failed 10 times in last hour
# Pattern: All Bash executions

# Solution: Check project permissions
# Solution: Verify shell is available
```

---

## FAQ

**Q: Does debug mode affect performance?**  
A: Minimal impact. Logs are kept in memory with automatic rotation.

**Q: Can I see debug logs from previous sessions?**  
A: No, debug logs are per-session and cleared when debug mode is disabled.

**Q: Are error logs shared between sessions?**  
A: Error history is per-user across all sessions, but grouped by session in display.

**Q: How much memory do debug logs use?**  
A: Approximately 100-200 KB per 1000 log entries (with rotation).

**Q: Can I export logs or metrics?**  
A: Not in Phase 6. Export feature planned for future phases.

**Q: What's the difference between `/errors` and `/logs`?**  
A: `/errors` shows logged errors from the database (always available). `/logs` shows debug logs from current session (requires debug mode).

**Q: Why is my health score low?**  
A: Low health score indicates high failure rate or many errors. Review metrics and errors to identify the cause.

---

## Related Commands

- `/status` - Show current session status
- `/history` - Show command history
- `/toollog` - Show tool execution history

---

## Next Steps

After Phase 6, you can:
- Monitor session health with `/metrics`
- Troubleshoot issues with `/debug on` and `/errors`
- Analyze performance patterns
- Report bugs with detailed error logs

**Coming in Phase 7:** Response Control (output formatting, length control, auto-preview)

---

## Support

If you encounter issues with debug commands:

1. Check this documentation
2. Try `/errors` to see what went wrong
3. Enable `/debug on` for detailed logs
4. Report the issue with error logs and metrics

---

**Phase 6 Complete! ✅**  
Debug & Info commands are now available for troubleshooting and monitoring.
