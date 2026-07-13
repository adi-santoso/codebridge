# CodeBridge - Architecture Design Document

## 1. Overview

CodeBridge adalah sistem bridge yang menghubungkan WhatsApp (via Baileys Gateway) dengan Claude Code, memungkinkan developer untuk coding via chat WhatsApp.

### 1.1 Goals

- **Accessibility**: Coding dari mana saja via WhatsApp
- **Multi-user**: Support banyak user concurrent dengan session terpisah
- **Project Management**: Easy switching antar project
- **Security**: Whitelist-based access control
- **Reliability**: Auto-recovery dan session persistence

### 1.2 Non-Goals

- Tidak replace IDE atau Claude Code GUI
- Tidak support file upload/download via WhatsApp (phase 1)
- Tidak support real-time collaboration antar user

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User (WhatsApp)                      │
│                   628xxx, 628yyy, ...                   │
└────────────────────────┬────────────────────────────────┘
                         │
                         │ WhatsApp Messages
                         ↓
┌─────────────────────────────────────────────────────────┐
│         Gateway (Socket.IO Server - External)           │
│  URL: https://chat.gatrion.my.id                        │
│  - WhatsApp Session Management (QR, Auth)               │
│  - Message Routing to/from WhatsApp                     │
│  - Socket.IO Server (manages rooms)                     │
│  - Room format: session-${sessionId}                    │
└────────────────────────┬────────────────────────────────┘
                         │
                         │ Socket.IO Connection
                         ↓
┌─────────────────────────────────────────────────────────┐
│         CodeBridge (Socket.IO Client - Internal)        │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Socket.IO Client Layer                        │   │
│  │  - Connect to Gateway with sessionId           │   │
│  │  - Join room: session-${sessionId}             │   │
│  │  - Listen for incoming messages                │   │
│  │  - Security (whitelist)                        │   │
│  │  - Rate limiting                               │   │
│  └──────────────────────┬──────────────────────────┘   │
│                         │                               │
│  ┌──────────────────────▼──────────────────────────┐   │
│  │  Command Parser                                 │   │
│  │  - /switch, /projects, /status, etc.            │   │
│  │  - Coding prompts                               │   │
│  └──────────────────────┬──────────────────────────┘   │
│                         │                               │
│  ┌──────────────────────▼──────────────────────────┐   │
│  │  Session Manager (DirectClaudeSpawner)          │   │
│  │  - User → Claude subprocess mapping             │   │
│  │  - Project context per user                     │   │
│  │  - Idle timeout & cleanup                       │   │
│  │  - Event-based message handling                 │   │
│  └──────────────────────┬──────────────────────────┘   │
│                         │                               │
│  ┌──────────────────────▼──────────────────────────┐   │
│  │  Claude Stream Handler                          │   │
│  │  - Parse stdout stream (claude-stream-json)     │   │
│  │  - Emit events: text, tool_use, turn_end       │   │
│  │  - Feed stdin with user prompts                │   │
│  └──────────────────────┬──────────────────────────┘   │
└─────────────────────────┼───────────────────────────────┘
                          │
                          │ stdio (claude-stream-json)
                          ↓
┌─────────────────────────────────────────────────────────┐
│         Claude CLI Subprocesses (Per User Session)     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ Subprocess 1│  │ Subprocess 2│  │ Subprocess N│    │
│  │ User: 628xxx│  │ User: 628yyy│  │ User: 628zzz│    │
│  │ Proj: API   │  │ Proj: React │  │ Proj: Mobile│    │
│  │ stdin/stdout│  │ stdin/stdout│  │ stdin/stdout│    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────┘
                          │
                          │ File operations
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  Project Directories                    │
│  /home/user/projects/laravel-api/                      │
│  /home/user/projects/react-dashboard/                  │
│  /home/user/projects/mobile-app/                       │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Component Breakdown

#### A. Gateway (Socket.IO Server - External)
- **Responsibility**: WhatsApp session management + Socket.IO server
- **Location**: https://chat.gatrion.my.id (separate service)
- **Implementation**: `whatsapp/src/websocket/server.js`
- **Protocol**: Socket.IO with WebSocket transport
- **Room Management**: 
  - Auto-join via query param: `?sessionId=xxx`
  - Manual join via event: `socket.emit('join-session', sessionId)`
  - Room format: `session-${sessionId}`
  - Broadcasts to room via `emitToSession(sessionId, event, data)`
- **Events**:
  - Server → Client: Various WhatsApp message events
  - Client → Server: `join-session`, `leave-session`
- **State**: Auth credentials, WhatsApp session state, Socket.IO room memberships

#### B. CodeBridge (Socket.IO Client)
**Socket.IO Client Layer**
- Connect to Gateway with `?sessionId=xxx`
- Auto-join room `session-${sessionId}` on connect
- Listen for incoming WhatsApp messages from room
- Security filter (whitelist)
- Rate limiting per user
- Message queue management

**Command Parser**
- Detect command vs coding prompt
- Commands: `/switch`, `/projects`, `/status`, `/reset`, `/help`
- Parse project name dan parameters

**Session Manager (DirectClaudeSpawner)**
- Map: `userId → { subprocess, projectPath, streamHandler }`
- Auto-spawn subprocess on first message
- Event-based message handling (text, tool_use, turn_end)
- Auto-cleanup idle subprocesses
- Session persistence (save/restore via SQLite)
- Protocol: claude-stream-json (NOT ACP/JSON-RPC)

**Claude Stream Handler**
- Parse stdout stream from Claude CLI subprocess
- Handle JSONL events: text_delta, tool_use, turn_end, etc.
- Feed stdin with formatted prompts and tool results
- Event emission to DirectClaudeSpawner

#### C. Claude CLI Subprocesses (Per User Session)
- One subprocess per active user
- Isolated project context (CWD = project path)
- Communication via stdin/stdout (claude-stream-json protocol)
- File operations within project directory
- Event stream processing via ClaudeStreamHandler

**Claude CLI Subprocess Configuration:**

CodeBridge spawns Claude CLI as Node.js subprocess per user session. Critical configuration issue discovered during Phase 3 testing:

**Problem:** Spawned subprocesses don't automatically inherit Claude CLI's configuration from `~/.claude/settings.json`.

When Claude CLI runs manually in terminal:
1. Loads `~/.claude/settings.json` automatically
2. Merges `env` object into process environment
3. Uses ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL, ANTHROPIC_MODEL from settings

When spawned via Node.js:
1. Only inherits process.env from parent
2. Does NOT load settings.json automatically
3. Results in authentication failures (401), wrong model selection

**Solution:** DirectClaudeSpawner explicitly loads settings.json before spawn

`src/claude/direct-spawner.js` implements:
- `loadClaudeSettings()`: Reads `~/.claude/settings.json` from user's home directory
- `buildEnvironment()`: Merges settings.json env vars with process.env, then applies constructor overrides
- Graceful fallback if settings.json doesn't exist or is invalid

**Configuration Priority (highest to lowest):**
1. Constructor options (apiKey, customEndpoint, model)
2. Settings.json env variables (ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL, ANTHROPIC_MODEL)
3. Process environment variables

**Why This Matters:**
- Allows spawned subprocesses to use user's configured kreova endpoint
- Enables custom models (kiro-claude-sonnet-4.5) instead of defaults
- Makes subprocess behavior match manual `claude` command behavior
- No code changes needed when user updates their Claude CLI config

**Example settings.json:**
```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "kv-...",
    "ANTHROPIC_BASE_URL": "http://localhost:3847",
    "ANTHROPIC_MODEL": "kiro-claude-sonnet-4.5"
  }
}
```

---

## 3. Data Flow

### 3.1 User Send Message Flow

**Current Implementation (Socket.IO + Direct Claude CLI Spawn):**

```
User (WhatsApp) → Gateway (Socket.IO Server) → CodeBridge (Socket.IO Client) → DirectClaudeSpawner
                   https://chat.gatrion.my.id              Joins room: session-${sessionId}
                   Room: session-${sessionId}              Listens for messages
                                                                    ↓
                                                             spawn subprocess
                                                                    ↓
                                                      ┌──────────────┴────────────────┐
                                                      │   Claude CLI subprocess       │
                                                      │   - Loads settings.json       │
                                                      │   - Uses stream-json I/O      │
                                                      │   - stdin: prompts/tool_result│
                                                      │   - stdout: events stream     │
                                                      └──────────────┬────────────────┘
                                                                     ↓
                                                           ClaudeStreamHandler
                                                              (parses events)
                                                                     ↓
                                                           Event-based callbacks
                                                           (text, tool_use, turn_end)
                                                                     ↓
                                                      Format response for WhatsApp
                                                                     ↓
                                                         Emit to Gateway room
                                                                     ↓
                                                         Gateway broadcasts
                                                                     ↓
                                                              User (WhatsApp)
```

**Detailed Steps:**

1. **User sends message** via WhatsApp
2. **Gateway receives** WhatsApp message from Baileys
3. **Gateway broadcasts** to Socket.IO room `session-${sessionId}`
4. **CodeBridge (Socket.IO client)** receives message from room
5. **Security check**: Verify nomor ada di whitelist
6. **Rate limit check**: Verify tidak exceed limit
7. **Command detection**: Check apakah command atau coding prompt
8. **Session lookup**: 
   - If exists: Load existing DirectClaudeSpawner session
   - If not: Create new session via `directSpawner.createSession(userId, {cwd, model})`
     - Loads ~/.claude/settings.json
     - Spawns `claude --print --input-format=stream-json --output-format=stream-json`
     - Wires up ClaudeStreamHandler to parse stdout
9. **Route to handler**:
   - Command → Execute command (switch project, list projects, dll)
   - Coding prompt → `spawner.sendPrompt(userId, text)` - writes to subprocess stdin
10. **Claude processes** dan generate response via stream-json protocol
11. **ClaudeStreamHandler emits events**:
    - `text_delta`: Streaming text chunks
    - `tool_use`: Tool execution requests
    - `turn_end`: Turn completion with stop_reason
12. **Format response** untuk WhatsApp (aggregate text, handle tool results)
13. **Emit to Gateway room** via Socket.IO client
14. **Gateway broadcasts** message to all clients in room
15. **Update session state** (timestamp, history in SQLite)

**Key Differences from Original Design:**
- ✅ Socket.IO architecture (Gateway = Server, CodeBridge = Client)
- ✅ Room-based message routing (session-${sessionId})
- ✅ Direct stdin/stdout communication with stream-json
- ✅ Event-based async handling instead of request/response
- ✅ Settings.json loading for subprocess config
- ✅ Persistent subprocess per user (not one-shot)
- ❌ No HTTP polling/webhook
- ❌ No ACP protocol layer
- ❌ No MCP server mode

### 3.2 Project Switching Flow

```
User: /switch laravel-api
  ↓
Parser detects command
  ↓
Session Manager:
  - Kill current Claude instance
  - Update user session: projectPath = /path/to/laravel-api
  - Spawn new Claude instance dengan project path baru
  ↓
Response: "✓ Switched to laravel-api"
```

### 3.3 Idle Cleanup Flow

```
Background Timer (every 5 minutes)
  ↓
Session Manager checks all sessions
  ↓
For each session:
  if (now - lastActivity > IDLE_TIMEOUT):
    - Kill Claude instance
    - Save session state to disk
    - Remove from active sessions map
```

### 3.4 Gateway Integration

**Location**: https://chat.gatrion.my.id  
**Repository**: `D:/working/gatrion/whatsapp/`  
**Implementation**: `src/websocket/server.js`  
**Status**: ✅ Complete, production-ready (NO changes needed)

#### Socket.IO Server Configuration

```javascript
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ['websocket'],
  pingTimeout: 60000,
  pingInterval: 25000
});
```

#### Room-Based Message Routing

**Room Format**: `session-${sessionId}`

**Auto-join via Query Param:**
```javascript
// Client connects with sessionId in query
const socket = io('https://chat.gatrion.my.id', {
  query: { sessionId: 'user-123' }
});
// Gateway auto-joins to room: session-user-123
```

**Manual join via Event:**
```javascript
// Client can also join manually
socket.emit('join-session', 'user-123');
// Receives confirmation:
socket.on('joined-session', ({ sessionId, room }) => {
  console.log(`Joined room: ${room}`);
});
```

**Broadcasting to Room:**
```javascript
// Gateway broadcasts messages to all clients in room
io.to('session-user-123').emit('whatsapp-message', {
  from: '628xxx',
  body: 'Hello Claude',
  timestamp: 1234567890
});
```

#### CodeBridge Integration

**Connection Setup:**
```javascript
import { io } from 'socket.io-client';

const socket = io('https://chat.gatrion.my.id', {
  query: { sessionId: 'codebridge-main' },
  transports: ['websocket']
});

// Listen for messages
socket.on('whatsapp-message', (data) => {
  handleIncomingMessage(data);
});

// Send responses back
socket.emit('send-response', {
  to: '628xxx',
  message: 'Response from Claude'
});
```

**Session ID Mapping:**
- WhatsApp User `628xxx` → Session ID: `628xxx`
- Room name: `session-628xxx`
- CodeBridge joins multiple rooms (one per active user)

#### Why Room-Based Architecture?

1. **Isolation**: Each user's messages isolated to their room
2. **Multi-client**: Multiple CodeBridge instances can join same room
3. **Scalability**: Gateway handles routing, CodeBridge focuses on logic
4. **Flexibility**: Can add web clients, monitoring dashboards, etc.
5. **Simplicity**: No HTTP polling, no webhook management

#### Integration Reference

**DO NOT MODIFY Gateway code** - it's a separate service with its own responsibilities:
- ✅ WhatsApp session management (Baileys)
- ✅ Socket.IO server and room management
- ✅ Message routing between WhatsApp and Socket.IO clients
- ❌ NOT responsible for Claude CLI interaction
- ❌ NOT responsible for session/project management
- ❌ NOT responsible for command parsing

**CodeBridge responsibilities:**
- ✅ Socket.IO client (joins rooms by session ID)
- ✅ Listen for messages from Gateway rooms
- ✅ Spawn and manage Claude CLI subprocesses
- ✅ Execute commands and handle coding prompts
- ✅ Send responses back via Gateway rooms

---

## 4. Data Models

### 4.1 User Session

```javascript
{
  userId: "628123456789",
  currentProject: "laravel-api",
  projectPath: "/home/user/projects/laravel-api",
  claudeInstance: ClaudeInstance,
  conversationHistory: [
    { role: "user", content: "...", timestamp: 1234567890 },
    { role: "assistant", content: "...", timestamp: 1234567891 }
  ],
  lastActivity: 1234567890,
  createdAt: 1234567800,
  settings: {
    autoCommit: false,
    autoTest: true
  }
}
```

### 4.2 Project Configuration

```javascript
{
  "laravel-api": {
    "path": "/home/user/projects/laravel-api",
    "description": "Laravel REST API",
    "default": true,
    "settings": {
      "autoCommit": false,
      "autoTest": true
    }
  }
}
```

### 4.3 WhatsApp Message

```javascript
{
  id: "msg_12345",
  from: "628123456789",
  body: "fix bug di UserController",
  timestamp: 1234567890,
  type: "text"
}
```

### 4.4 MCP Tool Definition

```javascript
{
  name: "send_whatsapp",
  description: "Send message to WhatsApp number",
  inputSchema: {
    type: "object",
    properties: {
      to: { type: "string" },
      message: { type: "string" }
    },
    required: ["to", "message"]
  }
}
```

---

## 5. API Specifications

### 5.1 Gateway Socket.IO API (External - Reference Only)

**Base URL**: `https://chat.gatrion.my.id`  
**Protocol**: Socket.IO (WebSocket transport)  
**Implementation**: `D:/working/gatrion/whatsapp/src/websocket/server.js`

#### Connection

```javascript
import { io } from 'socket.io-client';

const socket = io('https://chat.gatrion.my.id', {
  query: { sessionId: 'user-123' },  // Auto-join room
  transports: ['websocket']
});
```

#### Events (Server → Client)

**whatsapp-message**
```javascript
socket.on('whatsapp-message', (data) => {
  // data = {
  //   from: "628xxx@s.whatsapp.net",
  //   body: "hello",
  //   timestamp: 1234567890,
  //   messageId: "msg_123"
  // }
});
```

**whatsapp-status**
```javascript
socket.on('whatsapp-status', (data) => {
  // data = {
  //   status: "connected" | "disconnected" | "qr",
  //   qr: "base64-qr-code" // if status === "qr"
  // }
});
```

**joined-session** (confirmation after join)
```javascript
socket.on('joined-session', (data) => {
  // data = {
  //   sessionId: "session-user-123",
  //   room: "session-user-123"
  // }
});
```

#### Events (Client → Server)

**join-session** (manual room join)
```javascript
socket.emit('join-session', 'user-123');
```

**leave-session**
```javascript
socket.emit('leave-session', 'user-123');
```

**send-message** (send WhatsApp message)
```javascript
socket.emit('send-message', {
  to: '628xxx',
  message: 'Response text'
});
```

#### Server Methods (Internal - used by Gateway)

**emitToSession(sessionId, event, data)**
```javascript
// Gateway broadcasts to all clients in room
websocketServer.emitToSession('user-123', 'whatsapp-message', {
  from: '628xxx',
  body: 'Message text',
  timestamp: Date.now()
});
```

**getConnectedClients(sessionId)**
```javascript
const count = await websocketServer.getConnectedClients('user-123');
console.log(`${count} clients in room session-user-123`);
```

### 5.2 DirectClaudeSpawner API

**Current Implementation:** Event-based API using Node.js EventEmitter

#### Class: DirectClaudeSpawner

```javascript
import { DirectClaudeSpawner } from './src/claude/direct-spawner.js';

const spawner = new DirectClaudeSpawner({
  projectPath: '/path/to/default/project',  // Optional default
  apiKey: 'custom-key',                     // Optional (uses settings.json)
  customEndpoint: 'http://localhost:3847',  // Optional (uses settings.json)
  model: 'kiro-claude-sonnet-4.5'           // Optional (uses settings.json)
});
```

**Constructor Options:**
- `projectPath`: Default project directory for new sessions
- `apiKey`: Override ANTHROPIC_AUTH_TOKEN from settings.json
- `customEndpoint`: Override ANTHROPIC_BASE_URL from settings.json
- `model`: Override ANTHROPIC_MODEL from settings.json

**If constructor options omitted:** Subprocess inherits from `~/.claude/settings.json`

#### Methods

**createSession(userId, options)**
```javascript
const session = await spawner.createSession('user-123', {
  cwd: '/path/to/user/project',
  model: 'kiro-claude-sonnet-4.5'
});

// Returns session object with helper methods:
session.sendPrompt(text);
session.sendToolResult(toolUseId, content, isError);
session.close();
```

**sendMessage(userId, prompt, options)**
```javascript
// Auto-creates session if needed
await spawner.sendMessage('user-123', 'List files in src/', {
  cwd: '/path/to/project'
});
```

**sendPrompt(userId, text)**
```javascript
spawner.sendPrompt('user-123', 'Create a new component');
```

**sendToolResult(userId, toolUseId, content, isError)**
```javascript
spawner.sendToolResult('user-123', 'toolu_123', 'Command output', false);
```

**closeSession(userId)**
```javascript
await spawner.closeSession('user-123');
```

**getSessionStatus(userId)**
```javascript
const status = spawner.getSessionStatus('user-123');
// Returns: { userId, model, isReady, isClosed, pid }
```

#### Events

**Session Lifecycle:**
```javascript
spawner.on('session-created', ({ userId }) => {
  console.log(`Session created for ${userId}`);
});

spawner.on('session-closed', ({ userId, code, signal }) => {
  console.log(`Session closed: ${userId}`);
});
```

**Message Flow:**
```javascript
spawner.on('text', ({ userId, text }) => {
  // Streaming text chunk from Claude
  console.log(text);
});

spawner.on('thinking', ({ userId, thinking }) => {
  // Extended thinking content (if available)
});

spawner.on('tool-use', ({ userId, tool }) => {
  // Tool execution request
  // tool = { id, name, input }
  console.log(`Tool requested: ${tool.name}`);
  
  // Execute tool, then send result:
  const result = executeToolLocally(tool);
  spawner.sendToolResult(userId, tool.id, result);
});

spawner.on('turn-end', ({ userId, stopReason }) => {
  // Turn completed (stop_reason: end_turn, tool_use, max_tokens, etc.)
  console.log(`Turn completed: ${stopReason}`);
});
```

**Debugging:**
```javascript
spawner.on('debug', (message) => {
  console.log('[DEBUG]', message);
});

spawner.on('stderr', ({ userId, data }) => {
  console.error(`[${userId}]`, data);
});

spawner.on('error', ({ userId, error }) => {
  console.error(`Error for ${userId}:`, error);
});
```

#### Full Example

```javascript
import { DirectClaudeSpawner } from './src/claude/direct-spawner.js';

const spawner = new DirectClaudeSpawner({
  projectPath: '/home/user/projects/test-project'
});

// Listen for events
spawner.on('text', ({ userId, text }) => {
  process.stdout.write(text);
});

spawner.on('tool-use', async ({ userId, tool }) => {
  console.log(`\n🔧 Tool: ${tool.name}`);
  
  // Execute tool locally (or send to tool executor)
  const result = await executeToolLocally(tool);
  spawner.sendToolResult(userId, tool.id, result);
});

spawner.on('turn-end', ({ userId, stopReason }) => {
  console.log(`\n✅ Turn completed: ${stopReason}`);
});

// Create session and send prompt
const session = await spawner.createSession('user-123');
await session.sendPrompt('List files in current directory');

// Later: close session
await spawner.closeSession('user-123');
```

### 5.3 ClaudeStreamHandler API

**Class:** Parses stream-json protocol from Claude CLI stdout

```javascript
import { ClaudeStreamHandler } from './src/claude/stream-handler.js';

const handler = new ClaudeStreamHandler({
  onEvent: (event) => {
    // Handle parsed events
    console.log(event.type, event);
  }
});

// Feed stdout chunks
claudeProcess.stdout.on('data', (chunk) => {
  handler.feed(chunk);
});
```

**Event Types:**
- `message_start`: Turn started (includes message ID, TTFT)
- `text_delta`: Streaming text chunk
- `thinking_delta`: Extended thinking content
- `tool_use_start`: Tool block started
- `tool_input_delta`: Tool input JSON streaming
- `tool_use`: Tool request complete (id, name, input parsed)
- `turn_end`: Turn completed (stopReason, usage)
- `message_stop`: Message stream ended
- `system`: System events (init, hooks, retries)
- `unknown_message`: Unrecognized message type

**Usage in DirectClaudeSpawner:**
```javascript
const handler = new ClaudeStreamHandler({
  onEvent: (event) => this.handleStreamEvent(userId, event)
});

child.stdout.on('data', (chunk) => handler.feed(chunk));
```

---

### 5.4 Internal MCP Tools (Future Phase 5)

#### Tool: send_whatsapp
```javascript
{
  name: "send_whatsapp",
  arguments: {
    to: "628123456789",
    message: "Your code has been updated"
  }
}
```

#### Tool: get_pending_messages
```javascript
{
  name: "get_pending_messages",
  arguments: {
    limit: 10
  }
}

Response:
[
  {
    from: "628123456789",
    body: "fix bug di login",
    timestamp: 1234567890
  }
]
```

#### Tool: switch_project
```javascript
{
  name: "switch_project",
  arguments: {
    userId: "628123456789",
    projectName: "laravel-api"
  }
}
```

### 5.6 Protocol Evolution

#### Protocol Pivot: ACP → claude-stream-json

**Discovery Date**: 2026-07-10

**Original Approach (INCORRECT)**:
- Assumed Claude CLI uses ACP (Agent Communication Protocol) with JSON-RPC 2.0
- Built `src/claude/acp-session-handler.js` and `src/claude/json-rpc.js`
- Sent initialization requests: `{"jsonrpc": "2.0", "method": "initialize", ...}`
- Expected JSON-RPC responses

**Actual Protocol**:
- Claude CLI uses **claude-stream-json** format
- NOT ACP/JSON-RPC compatible
- Streams JSONL events via stdout
- Accepts user messages via stdin

**Why Original Approach Failed**:
1. Claude CLI outputs system messages: `{"type":"system","subtype":"hook_started",...}`
2. Never responds to JSON-RPC requests
3. `initialize` request times out after 15 seconds
4. Protocol mismatch - Claude CLI doesn't understand ACP

**Correct Implementation**:
- Port from open-design: `apps/daemon/src/runtimes/claude-stream.ts`
- Use `ClaudeStreamHandler` (NOT `attachAcpSession`)
- Input format: `{"type": "user", "message": {...}}`
- Output format: JSONL stream with various event types

#### Protocol Comparison

**ACP/JSON-RPC (Used by other agents, NOT Claude CLI)**:
```json
// Request
{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {...}}

// Response
{"jsonrpc": "2.0", "id": 1, "result": {...}}
```

**claude-stream-json (Used by Claude CLI ONLY)**:
```json
// Input (stdin)
{"type": "user", "message": {"role": "user", "content": [{"type": "text", "text": "..."}]}}

// Output (stdout) - JSONL stream
{"type":"system","subtype":"init","model":"claude-3-5-sonnet"}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"I'll "}}}
{"type":"assistant","message":{"role":"assistant","content":[...],"stop_reason":"end_turn"}}
{"type":"result","usage":{"input_tokens":150,"output_tokens":20}}
```

#### Lessons Learned

1. **Don't Assume Protocol Compatibility**: Each agent can have its own protocol
2. **Read Reference Implementation First**: open-design codebase was the source of truth
3. **Test with Real Output Early**: Run Claude CLI manually to understand format before building
4. **System Messages ≠ Responses**: Informational messages are separate from protocol responses

#### Implementation Status

- ✅ ClaudeStreamHandler ported from open-design
- ✅ DirectClaudeSpawner revised to use stream handler
- ✅ Event-based architecture implemented
- ✅ Integration tests passing
- ❌ ACP files archived (not deleted - kept for reference)

**Reference Files**:
- `docs/ARCHITECTURE_REVISION.md` - Full protocol discovery timeline
- `docs/CLAUDE_CLI_PROTOCOL_REFERENCE.md` - Detailed protocol spec
- `src/claude/archive/` - Original ACP implementation (archived)

---

## 6. Command System

### 6.1 Available Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/projects` | List all available projects | `/projects` |
| `/switch <name>` | Switch to different project | `/switch laravel-api` |
| `/current` | Show current project info | `/current` |
| `/status` | Show session status | `/status` |
| `/reset` | Reset conversation history | `/reset` |
| `/help` | Show available commands | `/help` |

### 6.2 Command Responses

#### /projects
```
📁 Available Projects:

1. [*] laravel-api
   Path: /home/user/projects/laravel-api
   Laravel REST API

2. [ ] react-dashboard
   Path: /home/user/projects/react-dashboard
   React Admin Dashboard

3. [ ] mobile-app
   Path: /home/user/projects/mobile-app
   React Native Mobile App

Use /switch <name> to change project
```

#### /switch laravel-api
```
✓ Switched to project: laravel-api
Path: /home/user/projects/laravel-api
Description: Laravel REST API

Ready to code!
```

#### /status
```
📊 Session Status

User: 628123456789
Project: laravel-api
Path: /home/user/projects/laravel-api
Active since: 2024-06-27 17:30:00
Messages: 15
Idle for: 2 minutes
```

---

## 7. Security Design

### 7.1 Authentication & Authorization

**Whitelist-based**
```
ALLOWED_NUMBERS=628123456789,628987654321
```

- Setiap message check nomor pengirim
- Reject jika tidak ada di whitelist
- Log semua rejected attempts

### 7.2 Rate Limiting

**Per-user rate limit**
```
RATE_LIMIT_WINDOW=60000        # 1 minute
RATE_LIMIT_MAX_REQUESTS=10     # 10 messages per minute
```

- Track messages per user per time window
- Reject dengan message: "Too many requests, please wait"

### 7.3 Input Sanitization

- Escape special characters sebelum kirim ke Claude
- Validate project names (prevent path traversal)
- Limit message length

### 7.4 File Access Control

- Claude instance hanya bisa akses project directory yang assigned
- Tidak bisa akses file diluar project path
- No access to system files atau sensitive paths

---

## 8. Session Management

### 8.1 Session Lifecycle

```
[Created] → [Active] → [Idle] → [Cleanup]
    ↓          ↓         ↓          ↓
  Spawn    Activity   Timer     Kill & Save
```

**States:**
- **Created**: User first message, spawn Claude instance
- **Active**: Recent activity (< idle timeout)
- **Idle**: No activity for X minutes
- **Cleanup**: Instance killed, state saved to disk

### 8.2 Session Persistence

**Save to disk** (`data/sessions/{userId}.json`):
```javascript
{
  userId: "628123456789",
  currentProject: "laravel-api",
  conversationHistory: [...],
  lastActivity: 1234567890,
  settings: {...}
}
```

**Restore on next message**:
- Load from disk
- Spawn new Claude instance
- Restore conversation context

### 8.3 Concurrent Sessions Limit

```
MAX_CONCURRENT_SESSIONS=10
```

- Track active sessions count
- Jika exceed: cleanup oldest idle session
- Warning ke user jika penuh

---

## 9. Error Handling

### 9.1 Error Categories

**A. WhatsApp Errors**
- Baileys gateway down → Retry with backoff
- Send message failed → Queue for retry
- Invalid message format → Log dan skip

**B. Claude Errors**
- Instance spawn failed → Retry 3x, notify user
- Response timeout → Kill instance, restart, notify user
- API error → Show user-friendly error message

**C. Session Errors**
- Session limit reached → Cleanup oldest idle
- Project not found → Show available projects
- Invalid command → Show help message

### 9.2 Error Response Format

```
❌ Error: Unable to connect to coding assistant

Reason: Instance startup failed
Action: Please try again in a moment

If problem persists, contact admin.
```

### 9.3 Recovery Strategies

| Error | Strategy |
|-------|----------|
| Baileys down | Queue messages, retry every 30s |
| Claude timeout | Kill & restart instance |
| Out of memory | Cleanup all idle sessions |
| Rate limit hit | Queue message, notify user |

---

## 10. Monitoring & Logging

### 10.1 Log Levels

- **ERROR**: Critical failures
- **WARN**: Recoverable issues
- **INFO**: Important events (session start/stop)
- **DEBUG**: Detailed trace (development only)

### 10.2 Key Metrics to Log

**Message Metrics**
- Messages received per minute
- Messages sent per minute
- Average response time
- Failed messages count

**Session Metrics**
- Active sessions count
- Session spawn rate
- Session cleanup rate
- Average session duration

**System Metrics**
- Memory usage
- CPU usage
- Baileys connection status
- Claude API response time

### 10.3 Log Format

```
2024-06-27 17:30:45 [INFO]: WhatsApp Message | direction=incoming from=628xxx message="fix bug..."
2024-06-27 17:30:46 [INFO]: Session Event: spawn | userId=628xxx project=laravel-api
2024-06-27 17:30:50 [INFO]: Claude Response | userId=628xxx duration=4200ms
2024-06-27 17:30:51 [INFO]: WhatsApp Message | direction=outgoing to=628xxx
```

---

## 11. Deployment Architecture

### 11.1 Recommended Setup (Ubuntu Server)

```
Ubuntu Server 22.04 LTS
├── Node.js 18+
├── PM2 (process manager)
├── Gateway (Socket.IO Server - separate service)
│   └── URL: https://chat.gatrion.my.id
└── CodeBridge (Socket.IO Client)
    └── Connects to Gateway
```

### 11.2 Two-Service Architecture

**Service 1: Gateway (Socket.IO Server)**
- **Location**: https://chat.gatrion.my.id
- **Repository**: `D:/working/gatrion/whatsapp/`
- **Responsibilities**:
  - WhatsApp session management (Baileys)
  - Socket.IO server
  - Room-based message routing
  - QR code handling
- **Port**: 443 (HTTPS)
- **Status**: ✅ Production-ready, NO changes needed

**Service 2: CodeBridge (Socket.IO Client)**
- **Location**: Internal service
- **Repository**: `D:/working/gatrion/codebridge/`
- **Responsibilities**:
  - Socket.IO client (connects to Gateway)
  - Claude CLI subprocess management
  - Command parsing and execution
  - Session/project management
- **Port**: No exposed port (connects to Gateway)
- **Status**: 🚧 In development

### 11.3 Directory Structure on Server

```
/home/user/
├── gateway/                      # Gateway Service (Socket.IO Server)
│   ├── src/
│   │   ├── websocket/
│   │   │   └── server.js        # Socket.IO server implementation
│   │   └── baileys/             # WhatsApp session management
│   ├── sessions/
│   │   └── default/             # Baileys auth data
│   └── .env

├── codebridge/                   # CodeBridge Service (Socket.IO Client)
│   ├── src/
│   │   ├── socket-client/       # Socket.IO client layer
│   │   ├── claude/
│   │   │   ├── direct-spawner.js
│   │   │   └── stream-handler.js
│   │   ├── session/             # Session manager
│   │   └── commands/            # Command parser
│   ├── data/
│   │   ├── sessions.db          # SQLite database
│   │   └── logs/                # Application logs
│   ├── .env
│   └── package.json

└── projects/                     # User projects
    ├── laravel-api/
    ├── react-dashboard/
    └── mobile-app/
```

### 11.4 Process Management (PM2)

```javascript
// pm2.config.js
module.exports = {
  apps: [
    {
      name: 'gateway',
      cwd: '/home/user/gateway',
      script: 'src/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'codebridge',
      cwd: '/home/user/codebridge',
      script: 'src/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        GATEWAY_URL: 'https://chat.gatrion.my.id'
      }
    }
  ]
};
```

### 11.4 Resource Requirements

**Minimum**:
- CPU: 2 cores
- RAM: 4GB
- Disk: 20GB SSD

**Recommended** (10 concurrent users):
- CPU: 4 cores
- RAM: 8GB
- Disk: 50GB SSD

**Per Claude Instance**:
- ~200-300MB RAM
- ~10% CPU (during processing)

---

## 12. Configuration Files

### 12.1 Environment Variables (.env)

**Gateway Service** (`gateway/.env`):
```bash
# Server
NODE_ENV=production
PORT=3000

# WhatsApp (Baileys)
SESSION_ID=default
DATA_DIR=./sessions
```

**CodeBridge Service** (`codebridge/.env`):
```bash
# Gateway Connection
GATEWAY_URL=https://chat.gatrion.my.id
GATEWAY_TRANSPORT=websocket

# Security
ALLOWED_NUMBERS=628xxx,628yyy

# Claude
CLAUDE_API_KEY=sk-ant-xxx
CLAUDE_CUSTOM_ENDPOINT=http://localhost:3847

# Session
SESSION_IDLE_TIMEOUT=1800000    # 30 minutes
MAX_CONCURRENT_SESSIONS=10

# Database
DATABASE_PATH=./data/sessions.db

# Logging
LOG_LEVEL=info
LOG_FILE=./data/logs/codebridge.log
```

### 12.2 Projects Config (projects.json)

```json
{
  "laravel-api": {
    "path": "/home/user/projects/laravel-api",
    "description": "Laravel REST API",
    "default": true
  }
}
```

### 12.3 Settings (settings.json)

```json
{
  "bridge": {
    "instanceMode": "per-user"
  },
  "whatsapp": {
    "pollingInterval": 2000,
    "useWebhook": false
  },
  "claude": {
    "responseTimeout": 120000
  }
}
```

---

## 13. Development Roadmap

### Phase 1 (MVP) ✓
- [x] Basic architecture design
- [ ] WhatsApp client implementation
- [ ] Session manager implementation
- [ ] Command parser
- [ ] MCP server core
- [ ] Basic commands (/projects, /switch, /status)
- [ ] Security (whitelist)
- [ ] Logging

### Phase 2 (Enhancement)
- [ ] Session persistence (save/restore)
- [ ] Rate limiting
- [ ] Auto-cleanup idle sessions
- [ ] Better error handling
- [ ] Conversation history management
- [ ] Multiple WhatsApp sessions support

### Phase 3 (Advanced)
- [ ] Web dashboard untuk monitoring
- [ ] Code snippet formatting (syntax highlight)
- [ ] File preview via WhatsApp
- [ ] Git integration (auto commit)
- [ ] Voice message transcription
- [ ] Group chat support

### Phase 4 (Scale)
- [ ] Multi-server deployment
- [ ] Load balancing
- [ ] Redis untuk session storage
- [ ] Metrics & analytics dashboard
- [ ] Auto-scaling

---

## 14. Alternative Approaches Considered

### 14.1 Direct Claude API (tanpa MCP)

**Pros:**
- Simpler architecture
- Easier to implement

**Cons:**
- Tidak ada file operation capabilities
- Manual handle conversation context
- Tidak bisa leverage Claude Code tools

**Verdict:** ❌ Rejected - butuh file operations

### 14.2 Single Claude Instance (shared)

**Pros:**
- Resource efficient
- Simpler session management

**Cons:**
- Context mixing antar user
- Security issues
- Scalability limited

**Verdict:** ❌ Rejected - security & isolation concerns

### 14.3 Web UI instead of WhatsApp

**Pros:**
- Better UX (rich formatting)
- Easier file upload/download
- No WhatsApp limitations

**Cons:**
- Tidak mobile-friendly
- Perlu deploy web server
- Tidak se-accessible WhatsApp

**Verdict:** ⚠️ Possible future addition, bukan replacement

---

## 15. Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Baileys gateway down | High | Medium | Retry mechanism, queue messages |
| Claude API rate limit | High | Low | Monitor usage, queue requests |
| Memory leak (Claude instances) | High | Medium | Aggressive cleanup, monitoring |
| WhatsApp account banned | Critical | Low | Follow WhatsApp ToS, rate limiting |
| Session data loss | Medium | Low | Regular backups, persistence |
| Concurrent session limit | Medium | Medium | Queue system, user notification |
| Security breach (unauthorized access) | Critical | Low | Whitelist, logging, audit |

---

## Appendix A: FAQ

**Q: Berapa lama idle timeout yang optimal?**
A: 30 menit. Balance antara responsiveness dan resource usage.

**Q: Bisa multi-project dalam satu chat?**
A: Tidak. Satu session = satu project. Gunakan `/switch` untuk ganti.

**Q: Bagaimana handle file besar?**
A: Phase 1 tidak support upload. Future: compress & chunk.

**Q: Apakah conversation history persistent?**
A: Ya, tersimpan di disk per user session.

**Q: Bisa pakai di group chat?**
A: Phase 1 tidak. Future: possible dengan mention system.

---

## Appendix B: Glossary

- **Baileys**: Node.js library untuk WhatsApp Web API
- **MCP**: Model Context Protocol - standard untuk AI tool integration
- **Session**: Isolated conversation context per user
- **Instance**: Running Claude Code process
- **Whitelist**: List nomor yang diizinkan akses
- **Idle Timeout**: Waktu maksimal tidak ada aktivitas sebelum cleanup

---

**Document Version**: 1.0  
**Last Updated**: 2024-06-27  
**Author**: CodeBridge Team
