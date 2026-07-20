# Command System - Phase 3: Tool Control

**Status**: ✅ Implemented  
**Priority**: HIGH  
**User Benefit**: Visibility and control over Claude's tool execution

---

## Overview

Phase 3 adds **tool control commands** that give you visibility into what tools Claude is using and allow you to control which tools are enabled. This helps you:

- See what tools Claude has access to
- Monitor tool execution history
- Enable/disable specific tools
- Retry failed tool operations
- Cancel long-running tool executions (best-effort)

---

## New Commands

### 1. `/tools` - List Available Tools

Shows all available tools with their status, usage statistics, and permissions.

**Usage:**
```
/tools                    # List all tools
/tools file               # Filter by category (file, search, execution, etc.)
```

**Example Output:**
```
🛠️ Available Tools

📁 FILE
  ✅ Read (15×)
     Read file contents
  ⚪ Write (3×)
     Write to file
  ✅ Edit (8×)
     Edit file (replace text)

📁 SEARCH
  ⚪ Grep (12×)
     Search file contents

Legend:
  ✅ Allowed  ❌ Denied  ⚪ Default

Commands:
  /allow <tool> - Enable tool
  /deny <tool> - Disable tool
  /toollog - Show execution history
```

**Categories:**
- `file` - File operations (Read, Write, Edit, Glob)
- `search` - Search operations (Grep)
- `execution` - Shell commands (Bash)
- `network` - Network tools (WebFetch, WebSearch)
- `analysis` - Analysis tools (Agent)
- `vcs` - Version control (git)
- `system` - System commands (ls, cat, find)

---

### 2. `/allow <tool>` - Enable Specific Tool

Adds a tool to your whitelist. Useful when running in whitelist mode.

**Usage:**
```
/allow Read               # Allow Read tool
/allow Web*               # Allow all Web* tools (WebFetch, WebSearch)
/allow *                  # Allow all tools (not recommended)
```

**Example Output:**
```
✅ Tools Enabled

  ✅ WebFetch - Fetch web content
  ✅ WebSearch - Search the web

Current Whitelist (5):
  • Read
  • Write
  • Edit
  • WebFetch
  • WebSearch

Permission Mode: whitelist

⚠️ Whitelist mode: Only allowed tools can run.
```

**Wildcard Patterns:**
- `*` matches any characters
- `?` matches single character
- Example: `Web*` matches `WebFetch`, `WebSearch`

---

### 3. `/deny <tool>` - Disable Specific Tool

Adds a tool to your blacklist. Prevents Claude from using specific tools.

**Usage:**
```
/deny Bash                # Disable Bash tool
/deny Web*                # Disable all Web* tools
```

**Example Output:**
```
🚫 Tools Disabled

  ❌ Bash - Execute shell command

Current Blacklist (1):
  • Bash

Permission Mode: blacklist

⚠️ Blacklist mode: Denied tools cannot run.
```

**Note**: Critical tools (if any) cannot be denied.

---

### 4. `/toollog [n]` - Show Tool Execution History

Displays recent tool executions with status, duration, and errors.

**Usage:**
```
/toollog                  # Show last 10 executions
/toollog 20               # Show last 20 executions
/toollog --tool=Read      # Filter by tool name
/toollog --status=error   # Show only errors
```

**Example Output:**
```
📊 Tool Execution Log

Showing last 10 of 45 executions:

✅ Read
   Jan 15, 02:30:15 PM • 150ms

❌ Bash
   Jan 15, 02:28:10 PM • 50ms
   Error: Command failed: ls nonexistent

⚠️ Write
   Jan 15, 02:25:05 PM • 100ms
   Cancelled by: test_user

✅ Grep
   Jan 15, 02:20:00 PM • 1.2s

... and 35 more
Use /toollog 45 to see more

Filters:
  /toollog --tool=Read - Filter by tool
  /toollog --status=error - Filter by status
```

**Status Icons:**
- ✅ Success
- ❌ Error
- ⚠️ Cancelled

---

### 5. `/retry` - Retry Last Failed Tool

Retries the last tool execution. Useful when a tool failed due to transient issues.

**Usage:**
```
/retry                    # Retry last failed tool
/retry --force            # Retry even if last execution succeeded
```

**Example Output:**
```
🔄 Retrying Tool Execution

Tool: Bash
Previous status: ❌ error
Executed: Jan 15, 02:28:10 PM
Error: Command failed: ls nonexistent

⏳ Retrying...

✅ Retry context set.

Claude will retry the tool execution in the next turn.
```

**When to Use:**
- Network request timed out
- File temporarily unavailable
- Transient system error
- Manual fix applied, need to re-run

---

### 6. `/cancel` - Stop Current Tool Execution

Attempts to cancel the currently running tool execution.

**Usage:**
```
/cancel                   # Cancel running tool
/stop                     # Alias for /cancel
/abort                    # Alias for /cancel
```

**Example Output:**
```
✅ Tool Cancellation Requested

Tool: Agent
Started: 02:30:15 PM

⚠️ Note: Cancellation is best-effort.
Some tools may complete before cancellation takes effect.
```

**Important Notes:**
- Cancellation is **best-effort** only
- Quick operations (Read, Write) may complete before cancellation
- Long-running operations (Agent, WebFetch) are more likely to be cancelled
- Some tools are not cancellable

---

## Tool Permission Modes

CodeBridge supports three permission modes (configured in `.env`):

### 1. `none` (Default)
**No permission enforcement.** All tools are available by default. Your allow/deny settings are tracked but not enforced.

**Use Case:** Development, testing, full Claude access

### 2. `whitelist`
**Only explicitly allowed tools can run.** All tools are blocked by default unless you use `/allow`.

**Use Case:** Production, restricted environments, security-conscious setups

**Setup:**
```bash
TOOL_PERMISSION_MODE=whitelist
```

**Workflow:**
```
/allow Read               # Allow file reading
/allow Write              # Allow file writing
/allow Grep               # Allow searching
# Other tools are blocked
```

### 3. `blacklist`
**All tools are available except explicitly denied ones.** Tools are allowed by default unless you use `/deny`.

**Use Case:** Allow most tools but block specific dangerous ones

**Setup:**
```bash
TOOL_PERMISSION_MODE=blacklist
```

**Workflow:**
```
/deny Bash                # Block shell execution
/deny WebFetch            # Block web access
# All other tools work normally
```

---

## Tool Audit Logging

All tool executions are automatically logged to the database for transparency and debugging.

**What's Logged:**
- Tool name
- Timestamp
- Duration (ms)
- Status (success, error, cancelled)
- Error messages (if failed)
- Parameters (optional, can be large)
- Results (optional, disabled by default due to size)

**Configuration:**
```bash
TOOL_AUDIT_ENABLED=true              # Enable logging
TOOL_AUDIT_LOG_PARAMS=true           # Log parameters (can be large)
TOOL_AUDIT_LOG_RESULTS=false         # Log results (WARNING: very large)
TOOL_AUDIT_MAX_ENTRIES=1000          # Max entries per user
```

**Automatic Cleanup:**  
When you exceed `TOOL_AUDIT_MAX_ENTRIES`, the oldest entries are automatically deleted.

---

## Use Cases

### Use Case 1: Debug Tool Failures

**Problem:** Claude says a tool failed but you don't know why.

**Solution:**
```
/toollog --status=error   # Show failed tools
# Review error messages
/retry                    # Retry if it was transient
```

---

### Use Case 2: Monitor Tool Usage

**Problem:** Want to know what tools Claude is using on your project.

**Solution:**
```
/tools                    # See all tools and usage counts
/toollog 50               # Review recent executions
```

---

### Use Case 3: Restrict Dangerous Tools

**Problem:** Don't want Claude running shell commands or accessing network.

**Solution:**
```bash
# Set in .env
TOOL_PERMISSION_MODE=blacklist
```

```
/deny Bash                # Block shell execution
/deny WebFetch            # Block web access
/deny WebSearch           # Block web search
```

---

### Use Case 4: Whitelist Only Safe Tools

**Problem:** Maximum security - only allow specific tools.

**Solution:**
```bash
# Set in .env
TOOL_PERMISSION_MODE=whitelist
```

```
/allow Read               # Safe: only reads files
/allow Grep               # Safe: only searches
/allow Edit               # Controlled: edits files
# Everything else is blocked
```

---

### Use Case 5: Cancel Long-Running Operations

**Problem:** Claude spawned an Agent that's taking too long.

**Solution:**
```
/cancel                   # Request cancellation
# Wait a moment
/toollog                  # Check if it was cancelled
```

---

## Command Aliases

For convenience, most commands have shorter aliases:

| Command | Aliases |
|---------|---------|
| `/cancel` | `/stop`, `/abort` |
| `/retry` | `/redo` |
| `/tools` | `/listtools` |
| `/allow` | `/enable` |
| `/deny` | `/disable` |
| `/toollog` | `/toolhistory` |

---

## Limitations

### 1. Tool Cancellation
- **Best-effort only** - DirectClaudeSpawner doesn't expose tool execution control
- Quick operations may complete before cancellation takes effect
- Some tools cannot be cancelled

### 2. Tool Discovery
- Tool registry is **manually maintained** (not dynamically discovered)
- New tools added to Claude CLI need to be manually registered
- Tool metadata may be incomplete or outdated

### 3. Tool Parameters
- Large parameters are **truncated** to 50KB to prevent database bloat
- Results are **not logged by default** (can be 100s of MB)
- Enable result logging with caution: `TOOL_AUDIT_LOG_RESULTS=true`

### 4. Permission Enforcement
- Permissions only work if `TOOL_PERMISSION_MODE` is set to `whitelist` or `blacklist`
- Critical tools (if any) bypass permission checks
- Some tools may be called indirectly and not appear in logs

---

## Configuration Reference

### Environment Variables

```bash
# Enable/disable audit logging
TOOL_AUDIT_ENABLED=true

# Log tool parameters (can be large)
TOOL_AUDIT_LOG_PARAMS=true

# Log tool results (WARNING: can be VERY large)
TOOL_AUDIT_LOG_RESULTS=false

# Max audit entries per user
TOOL_AUDIT_MAX_ENTRIES=1000

# Permission mode: 'whitelist', 'blacklist', or 'none'
TOOL_PERMISSION_MODE=none

# Cancellation timeout (ms)
TOOL_CANCEL_TIMEOUT=5000

# Max retry attempts
TOOL_RETRY_MAX_ATTEMPTS=3
```

---

## Database Schema

Phase 3 adds two new tables:

### `tool_audit` - Tool Execution Log
```sql
CREATE TABLE tool_audit (
  id INTEGER PRIMARY KEY,
  userId TEXT NOT NULL,
  sessionId TEXT NOT NULL,
  toolName TEXT NOT NULL,
  parameters TEXT,           -- JSON (truncated to 50KB)
  result TEXT,               -- JSON (optional, can be huge)
  status TEXT NOT NULL,      -- 'success', 'error', 'cancelled'
  errorMessage TEXT,
  executedAt INTEGER NOT NULL,
  duration INTEGER,          -- milliseconds
  cancelledBy TEXT           -- userId who cancelled
);
```

### `tool_permissions` - User Tool Permissions
```sql
CREATE TABLE tool_permissions (
  id INTEGER PRIMARY KEY,
  userId TEXT NOT NULL,
  toolName TEXT NOT NULL,
  permission TEXT NOT NULL,  -- 'allow' or 'deny'
  createdAt INTEGER NOT NULL,
  UNIQUE(userId, toolName)
);
```

---

## Migration

No migration needed - the new tables are created automatically on first run.

**Backward Compatibility:** ✅ Full backward compatibility with Phase 1 and Phase 2.

---

## FAQ

### Q: Why don't I see all tools Claude is using?

**A:** The tool registry is manually maintained. New tools added to Claude CLI need to be registered in `tool-registry.js`.

### Q: Can I really cancel tool execution?

**A:** Cancellation is **best-effort**. DirectClaudeSpawner doesn't expose tool execution control, so we can't guarantee cancellation. Quick operations may complete before cancellation takes effect.

### Q: Why are tool results not logged?

**A:** Tool results can be **massive** (100s of MB for large files). Logging results by default would bloat the database. Enable with `TOOL_AUDIT_LOG_RESULTS=true` at your own risk.

### Q: How do I enable whitelist mode?

**A:** Set `TOOL_PERMISSION_MODE=whitelist` in `.env` and restart. Then use `/allow <tool>` for each tool you want to enable.

### Q: Can I deny critical tools?

**A:** No. Critical tools (if any) are marked as such and cannot be denied. Currently, no tools are marked as critical.

### Q: What happens when I exceed max audit entries?

**A:** The oldest entries are automatically deleted. The limit is per-user, configurable via `TOOL_AUDIT_MAX_ENTRIES`.

---

## Next Steps

- **Phase 4: Response Control** - Control response verbosity and format
- **Phase 5: File Operations** - Quick file access commands
- **Phase 6: Debug & Info** - Debug mode and error tracking

---

## Feedback

Found a bug or have a suggestion? Please report it in the project issues.

**Phase 3 Status:** ✅ Complete  
**Last Updated:** January 2025
