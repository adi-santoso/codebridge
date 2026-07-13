# CodeBridge Architecture Revision

**Date:** 2026-07-10  
**Status:** Architecture Pivot Required  
**Reason:** Protocol Discovery - Claude CLI does NOT use ACP/JSON-RPC

---

## Problem Statement

### Original Architecture (INCORRECT)

```
WhatsApp Gateway
      ↓
  MCP Server (CodeBridge)
      ↓
  ACP Session Handler (attachAcpSession)
      ↓ JSON-RPC Protocol
  Claude CLI subprocess
```

**What we built:**
- `src/claude/json-rpc.js` - JSON-RPC 2.0 communication layer
- `src/claude/acp-session-handler.js` - ACP protocol implementation
- Sends: `{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {...}}`
- Expects: JSON-RPC responses

**Why it failed:**
- Claude CLI outputs system messages: `{"type":"system","subtype":"hook_started",...}`
- Claude CLI NEVER responds to JSON-RPC requests
- `initialize` request times out after 15 seconds
- Protocol mismatch: Claude CLI doesn't understand ACP/JSON-RPC

### Correct Architecture (FROM OPEN-DESIGN)

```
WhatsApp Gateway
      ↓
  MCP Server (CodeBridge)
      ↓
  Claude Stream Handler (createClaudeStreamHandler)
      ↓ claude-stream-json Protocol
  Claude CLI subprocess
```

**What we need:**
- `src/claude/claude-stream-handler.js` - Port from open-design
- Sends: `{"type": "user", "message": {"role": "user", "content": [...]}}`
- Receives: JSONL stream with various event types (status, text_delta, tool_use, etc.)

---

## Discovery Process

### Timeline

1. **Initial Error**: Missing `--verbose` flag → FIXED
2. **Second Error**: System messages not valid JSON-RPC → Filtered out
3. **Third Error**: `initialize` request timeout → Root cause discovered
4. **Investigation**: Read open-design codebase
5. **Discovery**: Found `streamFormat: 'claude-stream-json'` vs `'acp-json-rpc'`
6. **Confirmation**: `connectionTest.ts` uses `createClaudeStreamHandler`, NOT `attachAcpSession`

### Key Files Analyzed

From `D:\working\gatrion\open-design`:
- `apps/daemon/src/runtimes/defs/claude.ts` - Agent definition
- `apps/daemon/src/runtimes/claude-stream.ts` - Stream handler (~600 lines)
- `apps/daemon/src/connectionTest.ts` - Spawn logic (lines 1858-1892)
- `apps/daemon/src/server.ts` - Stdin write format (lines 7516-7538)
- `apps/daemon/src/agent-protocol/acp/session.ts` - ACP protocol (for comparison)

---

## Protocol Comparison

### ACP/JSON-RPC (What we built - WRONG)

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {...},
    "clientInfo": {...}
  }
}
```

**Response Expected:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {...},
    "serverInfo": {...}
  }
}
```

**Used by:** Other agents (pi, AMR, vela), NOT Claude CLI

### Claude Stream JSON (What we need - CORRECT)

**Input:**
```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      { "type": "text", "text": "list files in src/" }
    ]
  }
}
```

**Output Stream:**
```jsonl
{"type":"system","subtype":"init","model":"claude-3-5-sonnet","session_id":"sess_123"}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"I'll "}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"list the files"}}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"I'll list the files"}],"stop_reason":"end_turn"}}
{"type":"result","usage":{"input_tokens":150,"output_tokens":20},"total_cost_usd":0.005}
```

**Used by:** Claude Code CLI ONLY

---

## Required Changes

### 1. Delete/Archive Incorrect Files

These are based on wrong protocol assumption:

```bash
# Move to archive (don't delete - reference)
mkdir -p src/claude/archive
mv src/claude/acp-session-handler.js src/claude/archive/
mv src/claude/json-rpc.js src/claude/archive/
```

### 2. Port Stream Handler from Open-Design

**Source:** `D:\working\gatrion\open-design\apps\daemon\src\runtimes\claude-stream.ts`

**Create:** `src/claude/claude-stream-handler.js`

**Key Functions:**
- `createClaudeStreamHandler(onEvent, options)` - Main handler factory
- `feed(chunk)` - Process stdout chunks
- `flush()` - Handle end of stream
- Event normalization: raw events → high-level events

**Events to emit:**
- `status` - Lifecycle (initializing, thinking, working)
- `text_delta` - Incremental assistant text
- `thinking_delta` - Extended thinking text
- `tool_use` - Tool call with complete input
- `tool_result` - Tool execution result
- `turn_end` - Turn completed (stop_reason)
- `usage` - Token usage and cost

### 3. Revise Direct Spawner

**File:** `src/claude/direct-spawner.js`

**Changes:**

```javascript
// BEFORE (WRONG)
import { attachAcpSession } from './acp-session-handler.js';

async createSession(userId, options) {
  const child = await this.spawnClaudeProcess(cwd);
  
  // ❌ This uses ACP protocol
  const session = await attachAcpSession({
    child,
    cwd,
    model,
    clientName: 'codebridge',
    clientVersion: '1.0.0'
  });
  
  return session;
}

// AFTER (CORRECT)
import { createClaudeStreamHandler } from './claude-stream-handler.js';

async createSession(userId, options) {
  const child = await this.spawnClaudeProcess(cwd);
  
  // ✅ Use Claude stream handler
  const handler = createClaudeStreamHandler((event) => {
    this.handleStreamEvent(userId, event);
  });
  
  // Setup stdio pipes
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => handler.feed(chunk));
  child.on('close', () => handler.flush());
  
  // Create session wrapper
  const session = {
    userId,
    child,
    handler,
    stdin: child.stdin,
    isReady: true,
    isClosed: false,
    
    sendPrompt: (text) => this.sendPrompt(child.stdin, text),
    sendToolResult: (toolUseId, content, isError) => 
      this.sendToolResult(child.stdin, toolUseId, content, isError),
    close: () => this.closeSession(userId)
  };
  
  this.sessions.set(userId, session);
  this.emit('session-created', { userId });
  
  return session;
}

// New helper methods
sendPrompt(stdin, text) {
  const message = {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text }]
    }
  };
  
  stdin.write(JSON.stringify(message) + '\n');
}

sendToolResult(stdin, toolUseId, content, isError = false) {
  const message = {
    type: 'user',
    message: {
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: String(content),
        is_error: isError
      }]
    }
  };
  
  stdin.write(JSON.stringify(message) + '\n');
}

handleStreamEvent(userId, event) {
  switch (event.type) {
    case 'status':
      this.emit('debug', `[${userId}] Status: ${event.label}`);
      break;
      
    case 'text_delta':
      this.emit('text', { userId, text: event.delta });
      break;
      
    case 'thinking_delta':
      this.emit('thinking', { userId, thinking: event.delta });
      break;
      
    case 'tool_use':
      this.emit('tool-use', { userId, tool: event });
      break;
      
    case 'tool_result':
      this.emit('tool-result', { userId, result: event });
      break;
      
    case 'turn_end':
      this.emit('turn-end', { userId, stopReason: event.stopReason });
      break;
      
    case 'usage':
      this.emit('usage', { userId, usage: event });
      break;
      
    case 'error':
      this.emit('error', { userId, error: new Error(event.message) });
      break;
  }
}
```

### 4. Update Tests

**File:** `tests/quick-spawn-test.js`

**Changes:**

```javascript
// BEFORE
console.log('Sending prompt...');
const response = await session.sendPrompt('list files in this directory');
console.log('Response:', response);

// AFTER
console.log('Setting up event listeners...');
spawner.on('text', ({ userId, text }) => {
  process.stdout.write(text);
});

spawner.on('tool-use', ({ userId, tool }) => {
  console.log(`\nTool use: ${tool.name}`);
  console.log('Input:', tool.input);
});

spawner.on('turn-end', ({ userId, stopReason }) => {
  console.log(`\nTurn ended: ${stopReason}`);
  resolve();
});

console.log('Sending prompt...');
await session.sendPrompt('list files in this directory');

// Wait for turn to complete
await new Promise(resolve => {
  spawner.once('turn-end', resolve);
});
```

---

## Implementation Plan

### Phase 1: Port Stream Handler (2-3 hours)

1. **Read** `open-design/apps/daemon/src/runtimes/claude-stream.ts` thoroughly
2. **Port** to JavaScript as `src/claude/claude-stream-handler.js`
3. **Simplify** - Remove open-design specific code (artifacts, task tracking, etc.)
4. **Test** standalone with mock data

**Deliverable:** `src/claude/claude-stream-handler.js` with unit tests

### Phase 2: Revise Direct Spawner (1-2 hours)

1. **Archive** old ACP files
2. **Update** `direct-spawner.js` to use stream handler
3. **Implement** `sendPrompt()` and `sendToolResult()` helpers
4. **Add** event routing from handler to spawner emitter

**Deliverable:** Updated `src/claude/direct-spawner.js`

### Phase 3: Update Integration (1 hour)

1. **Update** `tests/quick-spawn-test.js`
2. **Test** end-to-end: spawn → prompt → response
3. **Test** multi-turn conversation
4. **Test** tool use flow

**Deliverable:** Working integration tests

### Phase 4: Documentation (30 mins)

1. **Update** `docs/ARCHITECTURE.md` with correct protocol
2. **Add** examples to README
3. **Document** event types and handling

**Deliverable:** Updated documentation

---

## Testing Strategy

### Test 1: Basic Spawn & Prompt

```javascript
const spawner = new DirectClaudeSpawner({
  customEndpoint: 'http://127.0.0.1:3847',
  projectPath: 'D:/test-project'
});

const session = await spawner.createSession('test-user');

let fullText = '';
spawner.on('text', ({ text }) => fullText += text);
spawner.on('turn-end', () => {
  console.log('Full response:', fullText);
});

await session.sendPrompt('Say hello');
```

**Expected:**
- System init event
- Text deltas streaming in
- Turn end event with `stop_reason: 'end_turn'`

### Test 2: Tool Use

```javascript
await session.sendPrompt('list files in src/');

spawner.once('tool-use', async ({ tool }) => {
  console.log('Tool requested:', tool.name, tool.input);
  
  // Execute tool (mock for test)
  const result = 'index.js\ncommands/\nservices/';
  
  // Send result back
  await session.sendToolResult(tool.id, result);
});

spawner.once('turn-end', ({ stopReason }) => {
  console.log('Completed:', stopReason);
});
```

**Expected:**
- Text explaining what it will do
- Tool use event: `{ name: 'Bash', input: { command: 'ls src/' } }`
- After sending result: More text with file list
- Turn end: `stop_reason: 'end_turn'`

### Test 3: Multi-Turn

```javascript
// Turn 1
await session.sendPrompt('What files are in src/?');
await waitForTurnEnd();

// Turn 2
await session.sendPrompt('Now create a new file test.js');
await waitForTurnEnd();

// Turn 3
await session.sendPrompt('Show me the file you created');
await waitForTurnEnd();

// Close
await spawner.closeSession('test-user');
```

**Expected:**
- Each turn completes independently
- Context is maintained (Claude remembers previous files)
- Stdin stays open between turns

---

## Success Criteria

- [x] Protocol correctly identified (claude-stream-json, NOT ACP)
- [ ] Stream handler ported and tested
- [ ] Direct spawner revised
- [ ] Basic spawn & prompt test passing
- [ ] Tool use test passing
- [ ] Multi-turn test passing
- [ ] Documentation updated
- [ ] Integration test with CodeBridge server passing

---

## Lessons Learned

### 1. Don't Assume Protocol Compatibility

**Mistake:** Assumed Claude CLI uses standard ACP/JSON-RPC because other agents do

**Reality:** Each agent can have its own protocol. Always check source code.

### 2. Read Reference Implementation First

**What we did:** Built based on protocol spec and assumptions

**What we should have done:** Read open-design implementation FIRST, then build

**Time saved:** Would have saved 2-3 hours of debugging wrong protocol

### 3. System Messages ≠ Responses

**Mistake:** Tried to parse `{type: "system"}` messages as JSON-RPC responses

**Reality:** System messages are informational only. Actual responses come in different format.

### 4. Test with Real Output Early

**What we did:** Built full architecture before testing with real Claude CLI

**What we should have done:** Run Claude CLI manually first, capture output, understand format, THEN build

---

## References

- **Full Protocol Documentation**: `docs/CLAUDE_CLI_PROTOCOL_REFERENCE.md`
- **Open-Design Source**: `D:\working\gatrion\open-design\apps\daemon\src\runtimes\`
- **Original Architecture**: `docs/ARCHITECTURE.md` (now outdated)
- **Test Results**: `tests/quick-spawn-test.js` output

---

## Next Session Tasks

1. Read and understand `CLAUDE_CLI_PROTOCOL_REFERENCE.md`
2. Port `createClaudeStreamHandler` to JavaScript
3. Test stream handler standalone
4. Revise `direct-spawner.js`
5. Run integration tests
6. Update all documentation

**Estimated Total Time:** 5-6 hours

**Priority:** HIGH - Blocking all further development

---

**Status:** Ready for implementation  
**Blockers:** None - clear path forward  
**Risk:** Low - reference implementation exists in open-design
