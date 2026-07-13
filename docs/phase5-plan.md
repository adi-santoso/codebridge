# Phase 5: WhatsApp Integration - Implementation Plan

**Status:** ⏳ PLANNING  
**Date:** 2026-07-10  
**Estimated Duration:** 3-5 days

---

## Critical Constraints (User Requirements)

1. ✅ **NO Baileys in CodeBridge** - User already has separate WhatsApp Gateway project
2. ✅ **External Gateway Communication** - Socket.IO server receives messages from user's gateway
3. ✅ **Session-First Architecture** - User selects session → project → then spawn Claude
4. ✅ **DirectClaudeSpawner** - Must use Claude CLI subprocess (NOT KreovaClient HTTP SDK)
5. ✅ **Tool Execution** - Must support Bash, Read, Write, Edit locally

---

## Current State Analysis

### ✅ What Already Exists

**Socket.IO Server (CORRECT INTERFACE)**
- ✅ `src/server.js` - Socket.IO server for external gateway
- ✅ `src/socket/connection-manager.js` - Authentication & rate limiting
- ✅ `src/socket/event-handlers.js` - Event routing
- ✅ Protocol defined:
  ```javascript
  // External WhatsApp Gateway sends:
  socket.emit('codebridge:message', {
    sessionId: '628xxx',  // WhatsApp phone number
    message: 'List files',
    metadata: {}
  });
  
  // CodeBridge responds:
  socket.emit('codebridge:response', {
    requestId: 'req_...',
    sessionId: '628xxx',
    response: 'Files: ...',
    metadata: { usage, model, ... }
  });
  ```

**DirectClaudeSpawner (Phase 1-3 Complete)**
- ✅ `src/claude/direct-spawner.js` - Working subprocess spawner with tool execution
- ✅ `src/claude/stream-handler.js` - Stream-json protocol parser
- ✅ Event-based API: `text`, `tool-use`, `turn-end`
- ✅ Settings.json loading for custom endpoints
- ✅ Tested with real kreova endpoint

### ❌ What Needs to Be Changed

**1. Session Manager (MAJOR REWRITE NEEDED)**
- ❌ `src/claude/session-manager.js` - Currently uses `KreovaClient` (HTTP SDK)
- ❌ **Problem:** KreovaClient cannot execute tools (Bash, Read, Write, Edit)
- ❌ **Fix Required:** Replace with DirectClaudeSpawner

**2. Message Handler (UPDATE NEEDED)**
- ❌ `src/whatsapp/message-handler.js` - Extracts response from KreovaClient notifications
- ❌ **Problem:** Designed for HTTP SDK response format
- ❌ **Fix Required:** Work with DirectClaudeSpawner events instead

**3. Tool Executor (MISSING)**
- ❌ No tool executor implementation
- ❌ **Problem:** DirectClaudeSpawner emits `tool-use` events, but nothing executes them
- ❌ **Fix Required:** Create ToolExecutor to handle Bash/Read/Write/Edit

**4. Session-First State Machine (MISSING)**
- ❌ No session selection/management UI
- ❌ **Problem:** User wants session selection BEFORE spawning Claude
- ❌ **Fix Required:** Add session management commands

### ❌ What Should Be Removed

**Baileys Client (User Does NOT Want)**
- ❌ `src/whatsapp/client.js` - Uses whatsapp-web.js (Baileys)
- ❌ `src/bridge.js` - Creates Baileys client
- ❌ `src/index.js` - Entry point for Baileys mode
- ❌ `package.json` - whatsapp-web.js dependency
- **Reason:** User has separate WhatsApp Gateway project

**KreovaClient (Wrong Architecture)**
- ❌ `src/claude/kreova-client.js` - HTTP SDK (no tool execution)
- **Reason:** DirectClaudeSpawner is the correct implementation

---

## Architecture Clarification

### WRONG Design (Current ARCHITECTURE.md)

```
WhatsApp User → Baileys Gateway → CodeBridge → Claude Code
                (SHOULD NOT BE IN CODEBRIDGE!)
```

### CORRECT Design (User's Requirement)

```
┌─────────────────────────────────────────────────┐
│  WhatsApp User (628xxx)                         │
└──────────────────┬──────────────────────────────┘
                   │
                   │ WhatsApp Protocol
                   ↓
┌─────────────────────────────────────────────────┐
│  External WhatsApp Gateway (USER'S PROJECT)     │
│  - Baileys / whatsapp-web.js                    │
│  - QR authentication                            │
│  - Message send/receive                         │
│  - Socket.IO Client                             │
└──────────────────┬──────────────────────────────┘
                   │
                   │ Socket.IO (codebridge:message)
                   ↓
┌─────────────────────────────────────────────────┐
│  CodeBridge Socket.IO Server                    │
│  src/server.js                                  │
│  - Connection Manager (auth, rate limit)        │
│  - Event Handlers (message routing)             │
└──────────────────┬──────────────────────────────┘
                   │
                   │ calls SessionManager
                   ↓
┌─────────────────────────────────────────────────┐
│  Session Manager (NEEDS REWRITE)                │
│  - User → Session mapping                       │
│  - Session → Project mapping                    │
│  - Session state machine                        │
└──────────────────┬──────────────────────────────┘
                   │
                   │ spawns DirectClaudeSpawner
                   ↓
┌─────────────────────────────────────────────────┐
│  DirectClaudeSpawner (Phase 1-3)                │
│  - Claude CLI subprocess per session            │
│  - Event-based API (text, tool-use, turn-end)  │
└──────────────────┬──────────────────────────────┘
                   │
                   │ emits tool-use events
                   ↓
┌─────────────────────────────────────────────────┐
│  ToolExecutor (NEEDS CREATION)                  │
│  - Execute Bash commands                        │
│  - Read/Write/Edit files                        │
│  - Send results back to spawner                 │
└─────────────────────────────────────────────────┘
```

---

## Session-First State Machine

User wants **session selection BEFORE spawning Claude**:

```
User Message → Check State → Route to Handler

States:
1. NO_SESSION       → Show session menu
2. SESSION_SELECTED → Show project menu  
3. PROJECT_SELECTED → Route to Claude

State Transitions:
- /newsession → Create session → SESSION_SELECTED
- /sessions → List sessions → NO_SESSION
- /project <name> → Set project → PROJECT_SELECTED
- /projects → List projects → SESSION_SELECTED
- Regular message → Execute if PROJECT_SELECTED, else prompt to select
```

---

## Phase 5 Implementation Tasks

### Task 1: Remove Baileys-Related Files (30 mins)

**Files to Remove:**
- `src/whatsapp/client.js` (Baileys implementation)
- `src/bridge.js` (Creates Baileys client)
- `src/index.js` (Entry point for Baileys mode)

**Files to Update:**
- `package.json` - Remove `whatsapp-web.js` dependency
- `docs/ARCHITECTURE.md` - Update to reflect external gateway

**Verification:**
- No references to Baileys/whatsapp-web.js in codebase
- Socket.IO server remains intact

---

### Task 2: Create ToolExecutor (2-3 hours)

**File:** `src/tools/executor.js`

**Purpose:** Execute tools requested by Claude CLI subprocess

**Interface:**
```javascript
import { ToolExecutor } from './tools/executor.js';

const executor = new ToolExecutor({
  projectPath: '/path/to/project'
});

// DirectClaudeSpawner integration
spawner.on('tool-use', ({ userId, tool }) => {
  executor.execute(tool).then((result) => {
    spawner.sendToolResult(userId, tool.id, result.output, result.isError);
  });
});
```

**Supported Tools:**
- ✅ Bash - Execute shell commands
- ✅ Read - Read file contents
- ✅ Write - Create/overwrite files
- ✅ Edit - Edit file with find/replace

**Features:**
- Sandboxing (prevent access outside projectPath)
- Timeout handling (kill long-running commands)
- Error handling (capture stderr)
- Logging (track all tool executions)

**Testing:**
```javascript
// Test: Bash tool
const result = await executor.execute({
  id: 'toolu_123',
  name: 'Bash',
  input: { command: 'ls -la' }
});

// Test: Read tool
const result = await executor.execute({
  id: 'toolu_124',
  name: 'Read',
  input: { file_path: '/path/to/file.js' }
});
```

---

### Task 3: Rewrite SessionManager (4-6 hours)

**File:** `src/claude/session-manager.js`

**Changes Required:**

**BEFORE (KreovaClient):**
```javascript
import { KreovaClient } from './kreova-client.js';

export class SessionManager {
  constructor(options = {}) {
    this.client = new KreovaClient({ ... });
    this.sessions = new Map(); // userId → conversationHistory
  }
  
  async sendMessage(userId, message) {
    // ❌ HTTP call - no tool execution!
    const response = await this.client.sendMessage(userId, message);
    return response;
  }
}
```

**AFTER (DirectClaudeSpawner):**
```javascript
import { DirectClaudeSpawner } from './direct-spawner.js';
import { ToolExecutor } from '../tools/executor.js';

export class SessionManager {
  constructor(options = {}) {
    this.spawner = new DirectClaudeSpawner({
      projectPath: options.projectPath
    });
    
    this.executor = new ToolExecutor({
      projectPath: options.projectPath
    });
    
    // Session state machine
    this.sessions = new Map(); // userId → { state, sessionId, projectPath, spawner }
    
    // Event handlers
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    // Handle text responses
    this.spawner.on('text', ({ userId, text }) => {
      this.appendResponse(userId, text);
    });
    
    // Handle tool execution
    this.spawner.on('tool-use', async ({ userId, tool }) => {
      const result = await this.executor.execute(tool);
      this.spawner.sendToolResult(userId, tool.id, result.output, result.isError);
    });
    
    // Handle turn completion
    this.spawner.on('turn-end', ({ userId, stopReason }) => {
      this.emit('response-ready', {
        userId,
        response: this.getResponse(userId),
        stopReason
      });
    });
  }
  
  async handleMessage(userId, message) {
    const session = this.sessions.get(userId);
    
    // State machine routing
    switch (session?.state) {
      case 'NO_SESSION':
        return this.handleSessionSelection(userId, message);
      
      case 'SESSION_SELECTED':
        return this.handleProjectSelection(userId, message);
      
      case 'PROJECT_SELECTED':
        return this.routeToClaude(userId, message);
      
      default:
        return this.showSessionMenu(userId);
    }
  }
  
  async routeToClaude(userId, message) {
    const session = this.sessions.get(userId);
    
    // Spawn Claude if not exists
    if (!session.spawner) {
      await this.spawner.createSession(userId, {
        cwd: session.projectPath
      });
    }
    
    // Send message to Claude
    await this.spawner.sendPrompt(userId, message);
  }
}
```

**Key Changes:**
1. ✅ Replace KreovaClient with DirectClaudeSpawner
2. ✅ Add ToolExecutor integration
3. ✅ Implement session state machine
4. ✅ Add event-based response handling
5. ✅ Session → Project mapping

---

### Task 4: Update Message Handler (1-2 hours)

**File:** `src/whatsapp/message-handler.js`

**Changes Required:**

**BEFORE (KreovaClient extraction):**
```javascript
extractResponseText(response) {
  // Extract from JSON-RPC notifications
  for (const notification of response.notifications) {
    if (notification.method === 'session/update') {
      // Complex extraction from HTTP SDK response
    }
  }
}
```

**AFTER (DirectClaudeSpawner events):**
```javascript
handleResponse(userId, eventData) {
  // Response already aggregated by SessionManager
  // Just format for WhatsApp
  return this.formatForWhatsApp(eventData.response);
}
```

**Key Changes:**
1. ✅ Remove KreovaClient response extraction logic
2. ✅ Work with DirectClaudeSpawner events
3. ✅ Listen to SessionManager 'response-ready' event
4. ✅ Format response for Socket.IO emission

---

### Task 5: Add Session Management Commands (3-4 hours)

**File:** `src/commands/session-commands.js` (NEW)

**UPDATED: Multiple Sessions Support**

```javascript
// /newsession - Create new session
async handleNewSession(userId) {
  const sessionId = this.generateSessionId(); // sess_abc123
  
  // Save to SQLite
  await this.db.run(`
    INSERT INTO sessions (userId, sessionId, state, createdAt, lastActive)
    VALUES (?, ?, 'SESSION_SELECTED', ?, ?)
  `, [userId, sessionId, Date.now(), Date.now()]);
  
  return `✅ New session created: ${sessionId}\n\nNext steps:\n1. Use /projects to list available projects\n2. Use /project <name> to select a project\n3. Start coding!`;
}

// /sessions - List all user's sessions
async handleListSessions(userId) {
  const sessions = await this.db.all(`
    SELECT sessionId, projectPath, state, lastActive
    FROM sessions
    WHERE userId = ?
    ORDER BY lastActive DESC
  `, [userId]);
  
  if (sessions.length === 0) {
    return '📭 No sessions found.\n\nUse /newsession to create one!';
  }
  
  return '📂 Your sessions:\n\n' + sessions.map(s => {
    const project = s.projectPath ? path.basename(s.projectPath) : 'No project';
    const lastActive = new Date(s.lastActive).toLocaleString();
    return `🔹 ${s.sessionId}\n   Project: ${project}\n   State: ${s.state}\n   Last active: ${lastActive}`;
  }).join('\n\n');
}

// /session <id> - Switch to session (REQUIRED for multiple sessions)
async handleSwitchSession(userId, sessionId) {
  const session = await this.db.get(`
    SELECT * FROM sessions
    WHERE userId = ? AND sessionId = ?
  `, [userId, sessionId]);
  
  if (!session) {
    return `❌ Session not found: ${sessionId}\n\nUse /sessions to list your sessions`;
  }
  
  // Set as active session for this user
  this.activeSessionMap.set(userId, sessionId);
  
  return `✅ Switched to session: ${sessionId}\n📁 Project: ${session.projectPath || 'Not selected'}\n\nYou can now send prompts or use /project to change project`;
}

// /project <name> - Select project for CURRENT session
async handleSelectProject(userId, projectName) {
  // Get active session for this user
  const sessionId = this.activeSessionMap.get(userId);
  
  if (!sessionId) {
    return '❌ No active session.\n\nUse /sessions to list sessions or /newsession to create one';
  }
  
  const projectPath = this.resolveProjectPath(projectName);
  
  if (!projectPath) {
    return `❌ Project not found: ${projectName}\n\nUse /projects to list available projects`;
  }
  
  // Update session in database
  await this.db.run(`
    UPDATE sessions
    SET projectPath = ?, state = 'PROJECT_SELECTED', lastActive = ?
    WHERE sessionId = ?
  `, [projectPath, Date.now(), sessionId]);
  
  return `✅ Project selected for session ${sessionId}:\n📁 ${projectName}\n📂 Path: ${projectPath}\n\nYou can now send coding prompts!`;
}

// /projects - List available projects from PROJECT_ROOT_PATH
async handleListProjects(userId) {
  const rootPath = process.env.PROJECT_ROOT_PATH;
  
  if (!rootPath) {
    return '❌ PROJECT_ROOT_PATH not configured.\n\nPlease set environment variable PROJECT_ROOT_PATH to your projects directory';
  }
  
  const projects = await this.scanProjects(rootPath);
  
  if (projects.length === 0) {
    return `📂 No projects found in:\n${rootPath}\n\nMake sure your projects are subdirectories of PROJECT_ROOT_PATH`;
  }
  
  return `📂 Available projects (${rootPath}):\n\n` + 
    projects.map(p => `🔹 ${p.name}\n   Path: ${p.path}`).join('\n\n');
}

// Scan projects from root path
async scanProjects(rootPath) {
  const { readdir } = require('fs/promises');
  const { join } = require('path');
  
  const entries = await readdir(rootPath, { withFileTypes: true });
  const projects = [];
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      projects.push({
        name: entry.name,
        path: join(rootPath, entry.name)
      });
    }
  }
  
  return projects;
}

// /status - Show current session status
async handleStatus(userId) {
  const sessionId = this.activeSessionMap.get(userId);
  
  if (!sessionId) {
    return '❌ No active session.\n\nUse /sessions to list sessions or /newsession to create one';
  }
  
  const session = await this.db.get(`
    SELECT * FROM sessions WHERE sessionId = ?
  `, [sessionId]);
  
  if (!session) {
    return '❌ Active session not found in database';
  }
  
  return `
📊 Session Status
─────────────────
Session ID: ${session.sessionId}
State: ${session.state}
Project: ${session.projectPath || 'Not selected'}
Created: ${new Date(session.createdAt).toLocaleString()}
Last Active: ${new Date(session.lastActive).toLocaleString()}
  `.trim();
}

// Generate session ID (sess_abc123)
generateSessionId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'sess_';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}
```

**Session Routing Logic (CRITICAL for Multiple Sessions):**
```javascript
async handleMessage(userId, message) {
  // Check if command
  if (message.startsWith('/')) {
    return this.commandParser.execute(userId, message);
  }
  
  // Get active session for this user
  const sessionId = this.activeSessionMap.get(userId);
  
  if (!sessionId) {
    return '❌ No active session.\n\nUse /sessions to list sessions or /newsession to create one';
  }
  
  // Get session details
  const session = await this.db.get(`
    SELECT * FROM sessions WHERE sessionId = ?
  `, [sessionId]);
  
  // Check session state
  if (session.state !== 'PROJECT_SELECTED') {
    return `❌ Session ${sessionId} has no project selected.\n\nUse /projects to list and /project <name> to select`;
  }
  
  // Route to Claude via SessionManager
  return this.sessionManager.routeToClaude(sessionId, session.projectPath, message);
}
```

**Database Schema:**
```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  sessionId TEXT UNIQUE NOT NULL,
  projectPath TEXT,
  state TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  lastActive INTEGER NOT NULL
);

CREATE INDEX idx_userId ON sessions(userId);
CREATE INDEX idx_sessionId ON sessions(sessionId);
```

---

### Task 6: Update Event Handlers (1 hour)

**File:** `src/socket/event-handlers.js`

**Changes Required:**

**BEFORE (Direct KreovaClient call):**
```javascript
async handleMessage(socket, data) {
  // ...
  const result = await this.sessionManager.sendMessage(sessionId, message);
  
  socket.emit('codebridge:response', {
    requestId,
    sessionId,
    response: result.text,  // ❌ Assumes synchronous response
    // ...
  });
}
```

**AFTER (Event-based handling):**
```javascript
async handleMessage(socket, data) {
  const { sessionId, message } = data;
  
  // Listen for response-ready event
  const responsePromise = new Promise((resolve) => {
    this.sessionManager.once(`response-ready:${sessionId}`, resolve);
  });
  
  // Send message to SessionManager
  await this.sessionManager.handleMessage(sessionId, message);
  
  // Wait for response
  const result = await responsePromise;
  
  socket.emit('codebridge:response', {
    requestId,
    sessionId,
    response: result.response,  // ✅ Event-based response
    metadata: result.metadata
  });
}
```

---

### Task 7: Remove KreovaClient (30 mins)

**Files to Remove:**
- `src/claude/kreova-client.js` - HTTP SDK implementation

**Files to Update:**
- Search for all imports of `kreova-client.js` and remove

**Verification:**
- No references to KreovaClient in codebase
- All session-manager imports use DirectClaudeSpawner

---

### Task 8: Update Documentation (1 hour)

**Files to Update:**
- `docs/ARCHITECTURE.md` - Remove Baileys references, add external gateway section
- `README.md` - Update Phase 5 status to complete
- `docs/NEXT_STEPS.md` - Mark Phase 5 tasks complete

**New Documentation:**
- `docs/phase5-complete.md` - Phase 5 completion summary
- `docs/EXTERNAL_GATEWAY.md` - Guide for external WhatsApp Gateway integration

---

### Task 9: End-to-End Testing (2-3 hours)

**Test Scenarios:**

**Test 1: Session Creation**
```javascript
// External Gateway sends:
socket.emit('codebridge:message', {
  sessionId: '628xxx',
  message: '/newsession'
});

// Expected response:
// "✅ Session created: sess_abc123"
```

**Test 2: Project Selection**
```javascript
socket.emit('codebridge:message', {
  sessionId: '628xxx',
  message: '/projects'
});
// List of projects

socket.emit('codebridge:message', {
  sessionId: '628xxx',
  message: '/project test-project'
});
// "✅ Project selected: test-project"
```

**Test 3: Coding Prompt with Tool Execution**
```javascript
socket.emit('codebridge:message', {
  sessionId: '628xxx',
  message: 'List files in current directory'
});

// Expected flow:
// 1. SessionManager routes to Claude
// 2. DirectClaudeSpawner emits tool-use (Bash)
// 3. ToolExecutor executes ls command
// 4. Result sent back to spawner
// 5. Claude generates response
// 6. Response sent to Socket.IO
// 7. Socket.IO emits codebridge:response
```

**Test 4: Multi-turn Conversation**
```javascript
// Turn 1
socket.emit('codebridge:message', {
  sessionId: '628xxx',
  message: 'Create a file called hello.js'
});
// Wait for response

// Turn 2
socket.emit('codebridge:message', {
  sessionId: '628xxx',
  message: 'Show me the content of hello.js'
});
// Should maintain context from Turn 1
```

**Test 5: Multiple Sessions Per User**
```javascript
// User creates 2 sessions
socket.emit('codebridge:message', { sessionId: '628xxx', message: '/newsession' });
// Response: "✅ New session created: sess_abc123"

socket.emit('codebridge:message', { sessionId: '628xxx', message: '/newsession' });
// Response: "✅ New session created: sess_def456"

// List sessions
socket.emit('codebridge:message', { sessionId: '628xxx', message: '/sessions' });
// Response: Shows both sess_abc123 and sess_def456

// Switch to first session and select project
socket.emit('codebridge:message', { sessionId: '628xxx', message: '/session sess_abc123' });
socket.emit('codebridge:message', { sessionId: '628xxx', message: '/project backend-api' });

// Send coding prompt (should route to sess_abc123)
socket.emit('codebridge:message', { sessionId: '628xxx', message: 'List controllers' });
// Expected: Response from backend-api project

// Switch to second session
socket.emit('codebridge:message', { sessionId: '628xxx', message: '/session sess_def456' });
socket.emit('codebridge:message', { sessionId: '628xxx', message: '/project frontend-app' });

// Send coding prompt (should route to sess_def456)
socket.emit('codebridge:message', { sessionId: '628xxx', message: 'List components' });
// Expected: Response from frontend-app project

// Verify context isolation
socket.emit('codebridge:message', { sessionId: '628xxx', message: '/session sess_abc123' });
socket.emit('codebridge:message', { sessionId: '628xxx', message: 'What was the last file I asked about?' });
// Should remember "controllers" from backend-api, NOT "components" from frontend-app
```

**Test 6: Session Persistence After Restart**
```javascript
// Create session and select project
socket.emit('codebridge:message', { sessionId: '628xxx', message: '/newsession' });
socket.emit('codebridge:message', { sessionId: '628xxx', message: '/project test' });

// Disconnect
socket.disconnect();

// Reconnect later
socket.connect();
socket.emit('authenticate', { authKey: '...' });

// Check status
socket.emit('codebridge:message', { sessionId: '628xxx', message: '/status' });
// Should show previous session state
```

---

## Implementation Timeline

| Task | Description | Estimated Time | Priority |
|------|-------------|----------------|----------|
| 1 | Remove Baileys files | 30 mins | HIGH |
| 2 | Create ToolExecutor | 2-3 hours | CRITICAL |
| 2b | Setup SQLite database & session persistence | 1-2 hours | CRITICAL |
| 3 | Rewrite SessionManager | 5-7 hours | CRITICAL |
| 4 | Update Message Handler | 1-2 hours | HIGH |
| 5 | Add Session Commands (with multiple session support) | 3-4 hours | HIGH |
| 6 | Update Event Handlers | 2 hours | MEDIUM |
| 7 | Remove KreovaClient | 30 mins | MEDIUM |
| 8 | Update Documentation | 1-2 hours | LOW |
| 9 | End-to-End Testing | 3-4 hours | CRITICAL |

**Total Estimated Time:** 19-27 hours (3-4 days of focused work)

---

## Success Criteria

✅ **Functional Requirements:**
- External WhatsApp Gateway can connect via Socket.IO
- Users can create sessions via /newsession
- Users can select projects via /project
- Coding prompts route to Claude CLI subprocess
- Tools (Bash, Read, Write, Edit) execute correctly
- Responses return to external gateway
- Multi-turn conversations maintain context

✅ **Non-Functional Requirements:**
- No Baileys dependencies in CodeBridge
- DirectClaudeSpawner used (not KreovaClient)
- Tool execution happens locally
- Session state persists across messages
- Error handling for all edge cases

✅ **Quality Requirements:**
- All tests pass (basic, tool-use, multi-turn)
- Documentation updated and accurate
- Code follows existing patterns
- No breaking changes to Phase 1-3 implementation

---

## Risks and Mitigations

**Risk 1: Tool Execution Security**
- **Concern:** Malicious commands executed via Bash tool
- **Mitigation:** Sandbox tool executor to projectPath only

**Risk 2: Session State Persistence**
- **Concern:** Sessions lost on server restart
- **Mitigation:** Implement session persistence to file/database

**Risk 3: External Gateway Protocol Mismatch**
- **Concern:** User's gateway sends different message format
- **Mitigation:** Document expected protocol, provide examples

**Risk 4: Performance with Multiple Users**
- **Concern:** Too many Claude subprocesses
- **Mitigation:** Implement idle timeout and auto-cleanup

---

## Design Decisions (CONFIRMED)

**Decision 1: Session Persistence**
- ✅ **SQLite database** (.codebridge/sessions.db)
- Schema: sessions table with userId, sessionId, projectPath, state, createdAt, lastActive
- Enables session recovery on restart
- Fast querying for session listing

**Decision 2: Project List Source**
- ✅ **Environment variable: PROJECT_ROOT_PATH**
- Example: `PROJECT_ROOT_PATH=/home/user/projects`
- CodeBridge scans subdirectories under PROJECT_ROOT_PATH
- Each subdirectory = one project
- Auto-discovery, no manual registration needed

**Decision 3: Session Naming**
- ✅ **Auto-generated session IDs** (sess_abc123)
- Format: `sess_` + random string (8 chars)
- User-friendly, avoids phone number exposure
- Stable across reconnections

**Decision 4: Multiple Sessions Per User**
- ✅ **Multiple sessions per user supported**
- User can create many sessions (/newsession)
- Each session has own project context
- Session selection via /session <id> before sending prompts
- **CRITICAL:** CodeBridge MUST handle ALL routing:
  - Incoming message → Identify session → Route to correct Claude instance
  - Claude response → Identify session → Route back to correct user/gateway
- Session state machine ensures messages only reach Claude when session + project selected

---

## Next Steps

**Immediate Actions (Waiting for User Approval):**
1. Answer open questions above
2. Review and approve this plan
3. Clarify external gateway message format (provide example)
4. Begin Task 1 (Remove Baileys files)

**After Approval:**
- Start with Task 2 (ToolExecutor) - CRITICAL PATH
- Parallel work on Task 3 (SessionManager rewrite)
- Sequential execution of remaining tasks

---

**Plan Status:** ⏳ AWAITING USER APPROVAL  
**Next Action:** User review and clarify open questions

