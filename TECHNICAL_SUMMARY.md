# Technical Implementation Summary

**Project:** CodeBridge - WhatsApp to Claude Code Bridge  
**For:** Personal use (single user)  
**Timeline:** 2-3 weeks  
**Architecture:** WhatsApp Gateway → MCP Server → Claude Code CLI

---

## Key Technical Decisions

### 1. MCP Server Approach ✅

**Decision:** Build MCP server that Claude Code CLI connects to

**Rationale:**
- You want local-only (no external API calls)
- Using Claude Code CLI with custom model
- MCP protocol allows Claude to call tools
- No internet dependency

**Risk:** Claude Code CLI subprocess control needs validation (Phase 0)

---

### 2. WhatsApp Gateway ✅

**Decision:** Use your existing gateway at `D:\working\gatrion\whatsapp`

**Why:**
- Already built and working
- Enterprise-grade (48+ endpoints, multi-session, production-ready)
- WebSocket events for real-time messages
- Much faster than building Telegram from scratch

**Integration:** HTTP API + WebSocket, simple and reliable

---

### 3. Session Architecture ✅

**Decision:** Per-user Claude subprocess with file-based storage

**Design:**
```
User Phone Number → Session Manager
                  ↓
            Claude Code subprocess
                  ↓
            Project working directory
```

**Storage:** JSON files in `data/sessions/{userId}.json`

**Lifecycle:**
- Create on first message
- Persist to disk
- Idle timeout: 30 minutes
- Auto-cleanup background timer

---

### 4. Message Flow ✅

**Incoming:**
```
WhatsApp → Gateway WebSocket → Poller → Parser
                                           ↓
                               Command? → Handler → Response
                                  or
                               Prompt? → Session → Claude → Response
```

**Outgoing:**
```
Response → Formatter → WhatsApp Client → Gateway API → User
```

---

## Critical Path Components

### Phase 0: BLOCKER ⚠️

**Must validate before proceeding:**

```javascript
// Can we spawn Claude Code CLI?
const claude = spawn('claude', ['--model', 'your-custom-model']);

// Can we send messages?
claude.stdin.write('list files\n');

// Can we read responses?
claude.stdout.on('data', (data) => { /* ... */ });
```

**If this fails:** Entire architecture needs redesign

**Fallback:** Direct Claude API (requires internet, different implementation)

---

### MCP Tools (Phase 1)

**Tools Claude can call:**

```javascript
// Send WhatsApp message
send_whatsapp_message({ to, message })

// Get pending messages  
get_pending_messages({ limit })

// Project management
get_current_project()
list_projects()
switch_project({ projectName })
```

**How it works:**
1. Claude decides to use tool
2. Calls via MCP protocol
3. Tool handler executes
4. Returns result to Claude
5. Claude includes in response

---

### WhatsApp Integration (Phase 2)

**HTTP Client:**
```javascript
whatsappClient.sendMessage(to, text)
whatsappClient.getStatus()
whatsappClient.initialize()
```

**WebSocket Poller:**
```javascript
poller.on('message', (msg) => {
  // Handle incoming message
});
```

**Key Features:**
- Automatic reconnection
- Message deduplication
- Error handling
- Connection monitoring

---

### Session Manager (Phase 3)

**Data Structure:**
```javascript
{
  userId: "628123456789",
  sessionId: "session-abc123",
  currentProject: "laravel-api",
  projectPath: "D:/projects/laravel-api",
  claudeProcess: ChildProcess,
  conversationHistory: [...],
  lastActivity: timestamp,
  createdAt: timestamp
}
```

**Key Operations:**
- `getOrCreateSession(userId)` - Lazy creation
- `restoreSession(userId)` - Load from disk
- `switchProject(userId, projectName)` - Kill & respawn
- `cleanupIdleSessions()` - Background timer

---

### Command Parser (Phase 4)

**Detection:**
```javascript
// Command starts with /
if (text.startsWith('/')) {
  // Parse command
  const [command, ...args] = text.slice(1).split(/\s+/);
  // Execute directly (no Claude)
}
```

**Supported Commands:**
- `/projects` - List from config
- `/switch <name>` - Change project
- `/current` - Show active project
- `/status` - Session info
- `/reset` - Clear history
- `/help` - Command list

---

## File Structure by Phase

**Phase 1:** MCP Server
```
src/mcp-server/server.js       # MCP server entry
src/mcp-server/tools.js        # Tool definitions
src/mcp-server/handlers.js     # Tool implementations
```

**Phase 2:** WhatsApp
```
src/whatsapp/client.js         # HTTP API client
src/whatsapp/poller.js         # WebSocket listener
```

**Phase 3:** Sessions
```
src/claude/instance.js         # Subprocess manager
src/claude/session.js          # Session manager
src/utils/session-storage.js  # Disk persistence
```

**Phase 4:** Commands
```
src/commands/parser.js         # Message parser
src/commands/handlers.js       # Command implementations
```

**Phase 5:** Integration
```
src/index.js                   # Main entry point
tests/e2e.test.js             # End-to-end tests
```

---

## Dependencies

**Required:**
```json
{
  "@modelcontextprotocol/sdk": "^0.5.0",
  "axios": "^1.6.0",
  "socket.io-client": "^4.8.0",
  "dotenv": "^16.4.0",
  "winston": "^3.11.0"
}
```

**Dev:**
```json
{
  "eslint": "^8.56.0",
  "nodemon": "^3.1.0"
}
```

---

## Configuration Files

**Environment Variables (.env):**
```env
# WhatsApp Gateway
BAILEYS_URL=http://localhost:3333
WHATSAPP_API_KEY=your-api-key

# Claude
CLAUDE_CLI_PATH=claude
CLAUDE_MODEL=your-custom-model

# Session
SESSION_IDLE_TIMEOUT=1800000
MAX_CONCURRENT_SESSIONS=10

# Logging
LOG_LEVEL=info
LOG_FILE=./data/logs/codebridge.log
```

**Projects (config/projects.json):**
```json
{
  "project-name": {
    "path": "D:/projects/project-name",
    "description": "Project description",
    "default": true
  }
}
```

---

## Error Handling Strategy

**Subprocess Crash:**
```javascript
claudeProcess.on('exit', (code) => {
  logger.error('Claude process died', { code });
  // Auto-restart once
  // Notify user if restart fails
});
```

**WhatsApp Gateway Down:**
```javascript
// Retry with exponential backoff
// Queue messages
// Alert user after 3 failed attempts
```

**Invalid Command:**
```javascript
// Return helpful error with /help suggestion
```

**Session Cleanup:**
```javascript
// Background timer every 5 minutes
// Check lastActivity vs IDLE_TIMEOUT
// Gracefully kill Claude subprocess
// Save state to disk
```

---

## Testing Strategy

**Unit Tests:**
- Config loader
- Message parser
- Session storage
- Command handlers

**Integration Tests:**
- WhatsApp client → Gateway
- MCP server → Claude subprocess
- Session manager lifecycle

**E2E Tests:**
- Send message → receive response
- Command execution
- Multi-turn conversation
- Session persistence

---

## Performance Targets

**MVP:**
- Response time: < 10 seconds
- Memory: < 500MB for 3 sessions
- Concurrent users: 1 (you)
- Uptime: Hours (not days)

**Production (later):**
- Response time: < 5 seconds
- Memory: < 200MB per session
- Concurrent users: 10+
- Uptime: Days/weeks

---

## Known Limitations (MVP)

1. **Single User:** Only you (multi-user in Phase 6)
2. **Text Only:** No image/file upload (Phase 7)
3. **Basic Formatting:** Simple text responses
4. **No Web UI:** WhatsApp only
5. **Local Only:** No remote access
6. **Manual QR:** Need to scan QR code manually

---

## Next Steps

1. ✅ Read all phase documentation
2. ⏭️ Start Phase 0: Validate Claude CLI
3. ⏭️ Run validation tests
4. ⏭️ Make GO/NO-GO decision
5. ⏭️ Begin Phase 1 implementation

---

## Success Metrics

**MVP Complete:**
- [ ] WhatsApp message → Claude response
- [ ] All commands work
- [ ] Session persists
- [ ] < 10s response time
- [ ] Runs for 1+ hour without crash

**Production Ready (later):**
- [ ] 99% uptime
- [ ] < 5s response time
- [ ] Multiple users
- [ ] Comprehensive error handling
- [ ] Monitoring dashboard

---

**Ready?** Start with [Phase 0 Validation](./docs/implementation/PHASE_0_VALIDATION.md)
