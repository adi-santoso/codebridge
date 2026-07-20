# Command System Phase 2: Session Management

**Status**: ✅ Implemented  
**Date**: January 2025  
**Version**: 1.0

## Overview

Phase 2 adds session lifecycle management commands, allowing users to control their conversation flow, save session states, and restore previous work contexts.

## Available Commands

### 1. `/reset` - Clear Conversation History

Clears the conversation history and starts fresh while keeping the session and project context.

**Aliases**: `/clear`, `/restart`

**Usage**:
```
/reset
```

**What it does**:
- Restarts the Claude subprocess
- Clears all conversation context
- Keeps session ID and project selection
- Ready for a fresh start

**Example**:
```
User: /reset
Bot: ✅ Session Reset

Conversation history cleared.
Session: sess_abc123
Project: codebridge

You can start a fresh conversation now.
```

**Requirements**:
- Active session with project selected
- Cannot reset empty session

---

### 2. `/history [n]` - View Command History

Shows the last N commands you've executed with timestamps and results.

**Aliases**: `/hist`

**Usage**:
```
/history              # Show last 10 commands (default)
/history 20           # Show last 20 commands
/history --limit=30   # Show last 30 commands
```

**What it shows**:
- Command name and arguments
- Execution timestamp
- Success/failure status
- Result preview (first 100 chars)

**Limits**:
- Default: 10 commands
- Maximum: 50 commands
- Configurable via `SESSION_HISTORY_MAX_LIMIT`

**Example**:
```
User: /history 5
Bot: 📜 Command History

Showing last 5 of 42 commands:

✓ /status
   Jan 15, 02:30 PM
   📊 CodeBridge Status...

✓ /project codebridge
   Jan 15, 02:28 PM
   ✅ Project Selected...

✓ /newsession
   Jan 15, 02:27 PM
   ✅ New Session Created...

... and 37 more commands
Use /history 42 to see more
```

**Note**: This shows command execution history, not full conversation messages. DirectClaudeSpawner doesn't store full conversation history.

---

### 3. `/save <name>` - Save Session Snapshot

Saves the current session state with a unique name for later restoration.

**Aliases**: `/snapshot`

**Usage**:
```
/save mywork           # Save with name "mywork"
/save project-v2       # Save with name "project-v2"
```

**What is saved**:
- Session ID
- Project path and name
- Session state
- Session metadata (created date, last active)

**What is NOT saved**:
- ⚠️ **Full conversation history** (limitation of DirectClaudeSpawner)
- Tool execution results
- Response buffers

**Limits**:
- Name must be alphanumeric with dashes/underscores only
- Max name length: 50 characters
- Max saved sessions per user: 10 (default)
- Max snapshot size: 10MB (default)
- Name must be unique per user

**Example**:
```
User: /save mywork
Bot: ✅ Session Saved

Name: mywork
Session: sess_abc123
Project: codebridge
Size: 2.5 KB
Saved: Jan 15, 2025, 02:30 PM

You have 3/10 saved sessions.

⚠️ Note: Conversation history is not saved.
Only project context and session state.
```

**Errors**:
- "Saved session with name 'X' already exists" - Use `/delete X` first
- "Maximum saved sessions (10) reached" - Delete some sessions first
- "Snapshot too large" - Start a fresh session
- "No active session to snapshot" - Create a session first
- "Cannot snapshot session without project" - Select a project first

---

### 4. `/load [name]` - Restore Saved Session

Restores a previously saved session by name. If no name provided, lists all available saved sessions.

**Aliases**: `/restore`

**Usage**:
```
/load              # List available saved sessions
/load mywork       # Load session named "mywork"
```

**What it does**:
1. Closes current active session (if any)
2. Creates new session with saved project context
3. Sets project from snapshot
4. Ready to continue work

**What is NOT restored**:
- ⚠️ **Conversation history** (limitation of DirectClaudeSpawner)
- This gives you a fresh session with the same project

**Example (list)**:
```
User: /load
Bot: 📦 Saved Sessions

Choose a session to load:

mywork
  Session: sess_abc123
  Saved: Jan 15, 2025
  Size: 2.5 KB

project-v2
  Session: sess_def456
  Saved: Jan 14, 2025
  Size: 3.1 KB

Usage: /load <name>
Example: /load mywork
```

**Example (load)**:
```
User: /load mywork
Bot: ✅ Session Loaded

Name: mywork
Session: sess_xyz789
Project: codebridge
Original saved: Jan 15, 2025

⚠️ Note: Conversation history is not restored.
This is a fresh session with the same project.

Ready to code!
```

---

### 5. `/sessions` - List All Saved Sessions

Shows all your saved sessions with metadata.

**Usage**:
```
/sessions              # Show first 10 saved sessions
/sessions --limit=20   # Show first 20 saved sessions
```

**What it shows**:
- Session name
- Session ID
- Save date
- Snapshot size
- Total count vs max allowed

**Limits**:
- Default: 10 sessions
- Maximum: 50 sessions per page

**Example**:
```
User: /sessions
Bot: 📦 Saved Sessions (5/10)

1. mywork
   Session: sess_abc123
   Saved: Jan 15, 02:30 PM
   Size: 2.5 KB

2. project-v2
   Session: sess_def456
   Saved: Jan 14, 08:15 AM
   Size: 3.1 KB

3. bugfix-auth
   Session: sess_ghi789
   Saved: Jan 13, 04:20 PM
   Size: 1.8 KB

Commands:
  /load <name> - Load a session
  /delete <name> - Delete a session
```

**Note**: Also aliased as `/list` and `/ls` for active sessions (existing functionality).

---

### 6. `/delete <name>` - Delete Saved Session

Permanently deletes a saved session snapshot.

**Aliases**: `/remove`, `/rm`

**Usage**:
```
/delete mywork         # Delete session named "mywork"
```

**What it does**:
- Removes snapshot from database
- Frees up saved session slot
- Cannot be undone

**Example**:
```
User: /delete mywork
Bot: ✅ Session Deleted

Name: mywork
Session: sess_abc123

You have 4/10 saved sessions remaining.
```

**Errors**:
- "Saved session not found: 'X'" - Check `/sessions` for available names
- "Missing session name" - Must provide name to delete

---

## Configuration

Environment variables in `.env`:

```bash
# Session Management (Phase 2)
SESSION_SNAPSHOT_MAX_SIZE=10485760   # 10MB max snapshot size
SESSION_MAX_SAVED=10                 # Max saved sessions per user
SESSION_HISTORY_DEFAULT_LIMIT=10     # Default messages in /history
SESSION_HISTORY_MAX_LIMIT=50         # Max messages in /history
```

---

## Important Limitations

### Conversation History Not Saved

**Why?** DirectClaudeSpawner (the Claude CLI wrapper) does not expose or store the full conversation buffer. It streams responses in real-time without maintaining a message history.

**What this means**:
- `/save` only saves session metadata and project context
- `/load` gives you a fresh session with the same project
- `/reset` works by restarting the subprocess (no history to clear)
- `/history` shows command execution history, not conversation messages

**Workaround**: If you need to preserve context:
1. Save important code/responses in files
2. Use `/save` to bookmark project states
3. Start fresh sessions for different contexts

**Future**: This may be improved if we switch to a different Claude integration that exposes message history.

---

## Workflow Examples

### Save and Resume Work

```bash
# Start working
/newsession
/project codebridge
[... do some work ...]

# Save current state
/save feature-auth

# Later, resume work
/load feature-auth
[... continue work ...]
```

### Multiple Contexts

```bash
# Work on feature A
/newsession
/project myapp
[... work on feature A ...]
/save feature-a

# Switch to bugfix
/newsession
/project myapp
[... work on bugfix ...]
/save bugfix-login

# Back to feature A
/load feature-a
```

### Clean Slate

```bash
# Too much context, start fresh
/reset

# Or create entirely new session
/newsession
/project myapp
```

### Managing Saved Sessions

```bash
# See what's saved
/sessions

# Clean up old sessions
/delete old-work
/delete temp-test

# Check remaining slots
/sessions
```

---

## Error Handling

### Common Errors

1. **"No active session"**
   - Solution: Use `/newsession` first

2. **"Cannot reset - no project selected"**
   - Solution: Use `/project <name>` first

3. **"Saved session with name 'X' already exists"**
   - Solution: Use `/delete X` first or choose different name

4. **"Maximum saved sessions (10) reached"**
   - Solution: Delete some sessions with `/delete`

5. **"Snapshot too large"**
   - Solution: Start a fresh session, your session has accumulated too much data

---

## Database Schema

Saved sessions are stored in SQLite:

```sql
CREATE TABLE saved_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  sessionId TEXT NOT NULL,
  name TEXT NOT NULL,
  snapshot TEXT NOT NULL,  -- JSON snapshot
  createdAt INTEGER NOT NULL,
  UNIQUE(userId, name)      -- One name per user
);
```

Snapshot JSON format:

```json
{
  "sessionId": "sess_abc123",
  "userId": "6285727042754",
  "projectPath": "/path/to/project",
  "projectName": "myproject",
  "state": "PROJECT_SELECTED",
  "messages": [],  // Empty - not stored
  "metadata": {
    "createdAt": 1705327200000,
    "lastActive": 1705327800000,
    "messageCount": 0,
    "savedAt": 1705328000000
  }
}
```

---

## Testing Checklist

- [x] `/reset` clears conversation and keeps session
- [x] `/history` shows recent commands with formatting
- [x] `/save mywork` creates snapshot successfully
- [x] `/load mywork` restores session state
- [x] `/sessions` lists all saved sessions
- [x] `/delete mywork` removes saved session
- [x] Max saved sessions limit enforced
- [x] Unique name constraint enforced
- [x] Snapshot size validation
- [x] Error messages are clear and actionable

---

## Known Issues

1. **Conversation history not saved**: Architectural limitation of DirectClaudeSpawner
2. **No pagination for saved sessions**: Will be added in future if needed
3. **No confirmation prompt for delete**: Simple delete for now, may add in future

---

## Next Steps (Phase 3)

Phase 3 will add:
- `/tools` - List available tools
- `/tools enable/disable` - Control tool execution
- `/cancel` - Cancel running request
- `/retry` - Retry last failed request

---

## Support

For issues or questions:
1. Check error messages for guidance
2. Use `/status` to see current state
3. Use `/help <command>` for command details
4. Review this documentation

---

**Last Updated**: January 2025  
**Phase**: 2 of 9  
**Status**: ✅ Complete
