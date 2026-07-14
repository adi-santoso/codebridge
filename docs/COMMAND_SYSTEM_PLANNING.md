# Command System Planning

## Overview
Implementasi command system untuk CodeBridge yang memungkinkan user kontrol session, tools, files, dan behavior melalui WhatsApp commands.

---

## Architecture Design

### 1. Command Flow
```
WhatsApp Message → Message Handler → Command Parser → Command Handler → Response
                                   ↓
                              (if not command)
                                   ↓
                            Claude Session Manager
```

### 2. Component Structure
```
src/
├── commands/
│   ├── parser.js              (existing - will enhance)
│   ├── handler.js             (NEW - main command dispatcher)
│   ├── registry.js            (NEW - command metadata & validation)
│   ├── middleware.js          (NEW - auth, rate limit, logging)
│   └── handlers/
│       ├── session.js         (session management commands)
│       ├── tools.js           (tool control commands)
│       ├── response.js        (response control commands)
│       ├── files.js           (file operations commands)
│       ├── debug.js           (debug & info commands)
│       ├── context.js         (context management commands)
│       ├── template.js        (template/shortcut commands)
│       └── admin.js           (admin commands)
```

### 3. Database Schema Enhancement
```sql
-- Command execution history
CREATE TABLE command_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  command TEXT NOT NULL,
  args TEXT,
  result TEXT,
  success BOOLEAN,
  executed_at INTEGER NOT NULL
);

-- User preferences
CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY,
  response_mode TEXT DEFAULT 'balanced',  -- brief, balanced, detailed
  debug_mode BOOLEAN DEFAULT 0,
  working_directory TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Saved sessions
CREATE TABLE saved_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  snapshot TEXT NOT NULL,  -- JSON snapshot
  created_at INTEGER NOT NULL
);

-- Admin whitelist (move from env to db)
CREATE TABLE admin_users (
  user_id TEXT PRIMARY KEY,
  role TEXT DEFAULT 'user',  -- user, admin, superadmin
  added_by TEXT,
  added_at INTEGER NOT NULL
);
```

---

## Implementation Phases

### Phase 1: Foundation (Priority: CRITICAL)
**Goal**: Setup command infrastructure dan core commands

**Tasks**:
1. Create command registry system
2. Enhance command parser dengan validation
3. Create command handler dispatcher
4. Create command middleware (auth, logging)
5. Implement basic commands:
   - `/help` - List available commands
   - `/ping` - Health check
   - `/version` - Version info
   - `/status` - Session status

**Files to Create/Modify**:
- `src/commands/registry.js` (NEW)
- `src/commands/handler.js` (NEW)
- `src/commands/middleware.js` (NEW)
- `src/commands/parser.js` (ENHANCE)
- `src/whatsapp/message-handler.js` (MODIFY)

**Estimated Time**: 4-6 hours

---

### Phase 2: Session Management (Priority: HIGH)
**Goal**: User control atas session lifecycle

**Commands to Implement**:
- `/reset` - Clear conversation history
- `/history [n]` - Show last N messages
- `/save [name]` - Save session state
- `/load [name]` - Restore saved session
- `/sessions` - List saved sessions
- `/delete [name]` - Delete saved session

**Database Changes**:
- Add `saved_sessions` table
- Add session snapshot functionality

**Files to Create/Modify**:
- `src/commands/handlers/session.js` (NEW)
- `src/claude/session-manager.js` (ADD snapshot methods)
- `src/database/session-db.js` (ADD saved_sessions methods)

**Estimated Time**: 3-4 hours

---

### Phase 3: Tool Control (Priority: HIGH)
**Goal**: Transparansi dan kontrol tool execution

**Commands to Implement**:
- `/tools` - List available tools
- `/tools enable [tool]` - Enable specific tool
- `/tools disable [tool]` - Disable specific tool
- `/cancel` - Cancel running request
- `/retry` - Retry last failed request

**Features**:
- Tool whitelist/blacklist per session
- Cancel mechanism untuk long-running tools
- Retry dengan preserved context

**Files to Create/Modify**:
- `src/commands/handlers/tools.js` (NEW)
- `src/tools/executor.js` (ADD cancel mechanism)
- `src/claude/session-manager.js` (ADD tool control)

**Estimated Time**: 4-5 hours

---

### Phase 4: Response Control (Priority: MEDIUM)
**Goal**: User bisa atur verbosity dan format response

**Commands to Implement**:
- `/brief` - Set response mode to brief
- `/balanced` - Set response mode to balanced (default)
- `/detailed` - Set response mode to detailed
- `/code-only` - Only send code
- `/explain-only` - Only send explanation

**Implementation**:
- Save preference ke database
- Inject system prompt modifier based on mode
- Modify response formatting

**Files to Create/Modify**:
- `src/commands/handlers/response.js` (NEW)
- `src/database/session-db.js` (ADD user_preferences methods)
- `src/claude/direct-spawner.js` (MODIFY system prompt injection)

**Estimated Time**: 2-3 hours

---

### Phase 5: File Operations (Priority: MEDIUM)
**Goal**: Quick file access tanpa overhead tool execution

**Commands to Implement**:
- `/ls [path]` - List directory contents
- `/cat [file]` - Read file content
- `/tree [path]` - Show directory tree
- `/search [pattern]` - Search in files
- `/diff [file]` - Show git diff

**Features**:
- Direct filesystem access (faster than tools)
- Smart output formatting untuk WhatsApp
- Path validation dan security

**Files to Create/Modify**:
- `src/commands/handlers/files.js` (NEW)
- `src/utils/file-ops.js` (NEW - helper utilities)

**Estimated Time**: 3-4 hours

---

### Phase 6: Debug & Info (Priority: MEDIUM)
**Goal**: Troubleshooting dan monitoring capabilities

**Commands to Implement**:
- `/debug on` - Enable debug mode
- `/debug off` - Disable debug mode
- `/errors [n]` - Show last N errors
- `/logs [n]` - Show last N log entries
- `/metrics` - Show session metrics

**Features**:
- Per-user debug logging
- Error history tracking
- Token usage tracking
- Tool execution stats

**Files to Create/Modify**:
- `src/commands/handlers/debug.js` (NEW)
- `src/utils/logger.js` (ADD per-user debug capability)
- `src/database/session-db.js` (ADD error_history table)

**Estimated Time**: 3-4 hours

---

### Phase 7: Context Management (Priority: LOW)
**Goal**: Advanced context control untuk power users

**Commands to Implement**:
- `/focus [path]` - Set working directory
- `/context add [file]` - Add file to context
- `/context list` - Show current context
- `/context clear` - Clear additional context
- `/ignore [pattern]` - Add to ignore list

**Features**:
- Persistent working directory per session
- Manual context injection
- .gitignore-like pattern matching

**Files to Create/Modify**:
- `src/commands/handlers/context.js` (NEW)
- `src/claude/session-manager.js` (ADD context management)

**Estimated Time**: 3-4 hours

---

### Phase 8: Templates & Shortcuts (Priority: LOW)
**Goal**: Common workflows jadi lebih cepat

**Commands to Implement**:
- `/ask [question]` - Quick question mode
- `/fix [error]` - Auto-fix error message
- `/review [file]` - Code review
- `/test [function]` - Generate tests
- `/doc [function]` - Generate documentation
- `/refactor [file]` - Refactoring suggestions

**Features**:
- Pre-defined system prompts per template
- Smart context extraction
- Result formatting

**Files to Create/Modify**:
- `src/commands/handlers/template.js` (NEW)
- `src/commands/templates/` (NEW - template definitions)

**Estimated Time**: 4-5 hours

---

### Phase 9: Admin Commands (Priority: LOW)
**Goal**: Multi-user management dan system administration

**Commands to Implement**:
- `/admin users` - List active users/sessions
- `/admin kill [userId]` - Force close session
- `/admin stats` - System-wide statistics
- `/admin reload` - Reload configuration
- `/admin whitelist add [number]` - Add to whitelist
- `/admin whitelist remove [number]` - Remove from whitelist
- `/admin whitelist list` - Show whitelist
- `/admin grant [userId] [role]` - Grant admin role
- `/admin revoke [userId]` - Revoke admin role

**Features**:
- Role-based access control (user, admin, superadmin)
- Move whitelist dari .env ke database
- Audit logging untuk admin actions

**Files to Create/Modify**:
- `src/commands/handlers/admin.js` (NEW)
- `src/database/session-db.js` (ADD admin_users, audit_log tables)
- `src/commands/middleware.js` (ADD role checking)

**Estimated Time**: 4-5 hours

---

## Technical Specifications

### Command Registry Format
```javascript
{
  name: 'reset',
  aliases: ['clear', 'restart'],
  category: 'session',
  description: 'Clear conversation history and start fresh',
  usage: '/reset',
  examples: ['/reset'],
  requiresAuth: true,
  requiresSession: true,
  requiredRole: 'user',
  rateLimit: { calls: 5, window: 60000 }, // 5 calls per minute
  handler: 'session.reset'
}
```

### Command Response Format
```javascript
{
  success: true,
  command: 'reset',
  message: 'Session reset successfully',
  data: { /* optional data */ },
  timestamp: 1234567890
}
```

### Error Response Format
```javascript
{
  success: false,
  command: 'reset',
  error: 'Session not found',
  code: 'SESSION_NOT_FOUND',
  timestamp: 1234567890
}
```

### Middleware Chain
```javascript
[
  authMiddleware,      // Check if user is in whitelist
  roleMiddleware,      // Check if user has required role
  rateLimitMiddleware, // Check rate limit
  validationMiddleware,// Validate command arguments
  loggingMiddleware,   // Log command execution
  handler,             // Execute command
  responseMiddleware   // Format and send response
]
```

---

## Configuration (.env additions)

```bash
# Command System
COMMAND_RATE_LIMIT_WINDOW=60000  # 1 minute
COMMAND_RATE_LIMIT_CALLS=20      # 20 commands per window
COMMAND_HISTORY_MAX=100          # Keep last 100 commands per user
COMMAND_ENABLE_ADMIN=true        # Enable admin commands

# File Operations
FILE_OPS_MAX_SIZE=1048576        # 1MB max for /cat
FILE_OPS_TREE_MAX_DEPTH=5        # Max depth for /tree
FILE_OPS_SEARCH_MAX_RESULTS=50   # Max results for /search

# Session Management
SESSION_SNAPSHOT_MAX_SIZE=10485760  # 10MB max snapshot
SESSION_MAX_SAVED=10                # Max saved sessions per user
```

---

## Testing Strategy

### Unit Tests
- Command parser validation
- Registry lookup
- Middleware execution
- Handler logic

### Integration Tests
- End-to-end command flow
- Database operations
- Error handling
- Rate limiting

### Manual Tests
- WhatsApp integration
- Response formatting
- Edge cases
- Security validation

---

## Security Considerations

1. **Input Validation**
   - Sanitize all command arguments
   - Validate file paths (prevent directory traversal)
   - Limit argument length

2. **Access Control**
   - Role-based command access
   - Whitelist verification
   - Admin action auditing

3. **Rate Limiting**
   - Per-user rate limits
   - Exponential backoff for abuse
   - Temporary ban mechanism

4. **Data Protection**
   - Encrypt saved sessions
   - Sanitize logs (no sensitive data)
   - Secure file operations

---

## Migration Plan

### Database Migration
```sql
-- migrations/001_command_system.sql
-- (SQL statements for new tables)
```

### Rollout Strategy
1. Deploy Phase 1 (foundation + basic commands)
2. Monitor for 1-2 days
3. Deploy Phase 2-3 (session + tools)
4. Monitor for 1 week
5. Deploy Phase 4-6 (response, files, debug)
6. Monitor for 1 week
7. Deploy Phase 7-9 (context, templates, admin)

### Backward Compatibility
- Old clients without commands still work normally
- Commands are opt-in feature
- No breaking changes to existing flow

---

## Success Metrics

### Phase 1 Success Criteria
- [ ] All basic commands working
- [ ] No regression in normal chat flow
- [ ] Command response time < 100ms
- [ ] Zero command parsing errors

### Overall Success Criteria
- [ ] 80% command success rate
- [ ] < 1% error rate
- [ ] User adoption > 50%
- [ ] Avg response time < 200ms
- [ ] Zero security incidents

---

## Future Enhancements (Post-Phase 9)

1. **Custom Commands**
   - User-defined command aliases
   - Macro recording
   - Command chaining

2. **Interactive Commands**
   - Multi-step wizards
   - Confirmation prompts
   - Form filling

3. **Scheduled Commands**
   - Cron-like scheduling
   - Reminder system
   - Auto-execution

4. **Voice Commands**
   - Voice message transcription
   - Natural language command parsing

---

## Documentation Plan

### User Documentation
- Command reference guide
- Quick start tutorial
- Use case examples
- FAQ

### Developer Documentation
- Architecture overview
- Adding new commands guide
- Testing guide
- API reference

---

## Risk Assessment

### High Risk
- **Database migration failure** → Mitigation: Backup before migration
- **Rate limiting too strict** → Mitigation: Configurable limits
- **Security vulnerabilities** → Mitigation: Code review + testing

### Medium Risk
- **Command conflicts** → Mitigation: Registry validation
- **Performance degradation** → Mitigation: Load testing
- **User confusion** → Mitigation: Good documentation + help system

### Low Risk
- **Feature creep** → Mitigation: Stick to phases
- **Maintenance burden** → Mitigation: Good test coverage

---

## Conclusion

Command system akan menjadi foundation untuk advanced features CodeBridge. Implementasi bertahap memastikan stability dan memberikan value incremental ke user.

**Recommended Start**: Phase 1 → Phase 2 → Phase 3 (core functionality first)

**Total Estimated Time**: 30-40 hours (spread across 2-3 weeks)
