# Claude Integration Module

Direct Claude CLI integration via subprocess spawning with event-based API.

## Overview

This module provides two core classes for spawning and communicating with Claude CLI:

1. **DirectClaudeSpawner**: Manages Claude CLI subprocess lifecycle and user sessions
2. **ClaudeStreamHandler**: Parses stream-json protocol output from Claude CLI

## Architecture

```
DirectClaudeSpawner                ClaudeStreamHandler
       │                                  │
       │ spawn subprocess                 │
       ├─────────────────┐                │
       │                 │                │
       │          ┌──────▼────────┐       │
       │          │   Claude CLI   │       │
       │          │   subprocess   │       │
       │          └──────┬────────┘       │
       │                 │                │
       │          stdout │ (NDJSON)       │
       │                 ├────────────────┤
       │                 │   feed(chunk)  │
       │                 │                │
       ├─────────────────┤   parse & emit │
       │   Event: text   │◄───────────────┤
       │   Event: tool   │                │
       │   Event: end    │                │
       └─────────────────┘                │
```

## DirectClaudeSpawner

### Constructor

```javascript
import { DirectClaudeSpawner } from './direct-spawner.js';

const spawner = new DirectClaudeSpawner({
  projectPath: '/default/project/path',  // Optional
  apiKey: 'custom-api-key',              // Optional (uses settings.json)
  customEndpoint: 'http://localhost:3847', // Optional (uses settings.json)
  model: 'kiro-claude-sonnet-4.5'        // Optional (uses settings.json)
});
```

**Options:**
- `projectPath`: Default working directory for spawned subprocesses
- `apiKey`: Override ANTHROPIC_AUTH_TOKEN from settings.json
- `customEndpoint`: Override ANTHROPIC_BASE_URL from settings.json
- `model`: Override ANTHROPIC_MODEL from settings.json

**If options omitted:** Subprocess inherits from `~/.claude/settings.json`

### Settings.json Loading

DirectClaudeSpawner automatically loads `~/.claude/settings.json` to inherit user's Claude CLI configuration:

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "kv-...",
    "ANTHROPIC_BASE_URL": "http://localhost:3847",
    "ANTHROPIC_MODEL": "kiro-claude-sonnet-4.5"
  }
}
```

**Configuration Priority (highest to lowest):**
1. Constructor options
2. Settings.json env variables
3. Process environment variables

### Methods

#### createSession(userId, options)

Creates a new Claude CLI subprocess session for a user.

```javascript
const session = await spawner.createSession('user-123', {
  cwd: '/path/to/user/project',
  model: 'kiro-claude-sonnet-4.5'
});

// Session helper methods:
session.sendPrompt('List files');
session.sendToolResult('toolu_123', 'output', false);
session.close();
```

**Parameters:**
- `userId` (string): Unique user identifier
- `options.cwd` (string): Project directory for this session
- `options.model` (string): Model override for this session

**Returns:** Session object with helper methods

**Throws:** Error if spawn fails or session already exists

#### sendMessage(userId, prompt, options)

Send message to user's session (auto-creates if needed).

```javascript
await spawner.sendMessage('user-123', 'Create a new component', {
  cwd: '/path/to/project'
});
```

**Parameters:**
- `userId` (string): User identifier
- `prompt` (string): Message text
- `options.cwd` (string): Project directory (if creating new session)

#### sendPrompt(userId, text)

Send prompt to existing session.

```javascript
spawner.sendPrompt('user-123', 'What files are in src/?');
```

**Parameters:**
- `userId` (string): User identifier
- `text` (string): Prompt text

**Throws:** Error if session doesn't exist

#### sendToolResult(userId, toolUseId, content, isError)

Send tool execution result back to Claude.

```javascript
spawner.sendToolResult('user-123', 'toolu_abc123', 'Command output', false);
```

**Parameters:**
- `userId` (string): User identifier
- `toolUseId` (string): Tool use ID from tool-use event
- `content` (string): Result content
- `isError` (boolean): Whether result is an error (default: false)

#### closeSession(userId)

Close user's session and kill subprocess.

```javascript
await spawner.closeSession('user-123');
```

**Parameters:**
- `userId` (string): User identifier

**Returns:** Promise that resolves when session closed

#### getSessionStatus(userId)

Get current status of user's session.

```javascript
const status = spawner.getSessionStatus('user-123');
// Returns: { userId, model, isReady, isClosed, pid }
```

**Returns:** Status object or null if session doesn't exist

#### getAllSessions()

Get list of all active sessions.

```javascript
const sessions = spawner.getAllSessions();
// Returns: [{ userId, model, isReady, isClosed, pid }, ...]
```

**Returns:** Array of session status objects

#### closeAll()

Close all active sessions.

```javascript
await spawner.closeAll();
```

**Returns:** Promise that resolves when all sessions closed

### Events

DirectClaudeSpawner extends EventEmitter and emits these events:

#### Session Lifecycle Events

**session-created**
```javascript
spawner.on('session-created', ({ userId }) => {
  console.log(`Session created for ${userId}`);
});
```

**session-closed**
```javascript
spawner.on('session-closed', ({ userId, code, signal }) => {
  console.log(`Session closed for ${userId}`);
});
```

#### Message Flow Events

**text**
```javascript
spawner.on('text', ({ userId, text }) => {
  // Streaming text chunk from Claude
  process.stdout.write(text);
});
```

**thinking**
```javascript
spawner.on('thinking', ({ userId, thinking }) => {
  // Extended thinking content (if enabled)
  console.log('[Thinking]', thinking);
});
```

**tool-use**
```javascript
spawner.on('tool-use', ({ userId, tool }) => {
  // Tool execution request
  // tool = { id, name, input }
  console.log(`Tool: ${tool.name}`);
  
  // Execute tool locally, then send result:
  const result = executeToolLocally(tool);
  spawner.sendToolResult(userId, tool.id, result);
});
```

**turn-end**
```javascript
spawner.on('turn-end', ({ userId, stopReason }) => {
  // Turn completed
  // stopReason: 'end_turn', 'tool_use', 'max_tokens', etc.
  console.log(`Turn ended: ${stopReason}`);
});
```

#### Debug Events

**debug**
```javascript
spawner.on('debug', (message) => {
  console.log('[DEBUG]', message);
});
```

**stderr**
```javascript
spawner.on('stderr', ({ userId, data }) => {
  console.error(`[${userId} stderr]`, data);
});
```

**error**
```javascript
spawner.on('error', ({ userId, error }) => {
  console.error(`Error for ${userId}:`, error);
});
```

### Complete Example

```javascript
import { DirectClaudeSpawner } from './direct-spawner.js';

const spawner = new DirectClaudeSpawner({
  projectPath: '/home/user/projects/test-project'
});

// Event listeners
let response = '';

spawner.on('text', ({ userId, text }) => {
  response += text;
  process.stdout.write(text);
});

spawner.on('tool-use', async ({ userId, tool }) => {
  console.log(`\n🔧 Tool: ${tool.name}`);
  
  // Execute tool locally
  const result = await executeToolLocally(tool);
  spawner.sendToolResult(userId, tool.id, result);
});

spawner.on('turn-end', ({ userId, stopReason }) => {
  console.log(`\n✅ Turn completed: ${stopReason}`);
  console.log('Full response:', response);
  response = ''; // Reset for next turn
});

// Create session
const session = await spawner.createSession('user-123');

// Send prompts
await session.sendPrompt('List files in current directory');

// Wait for turn-end event, then next prompt
await session.sendPrompt('Create a file called hello.txt');

// Close when done
await spawner.closeSession('user-123');
```

---

## ClaudeStreamHandler

Parser for Claude CLI's stream-json protocol output.

### Constructor

```javascript
import { ClaudeStreamHandler } from './stream-handler.js';

const handler = new ClaudeStreamHandler({
  onEvent: (event) => {
    console.log('Event:', event.type, event);
  }
});
```

**Options:**
- `onEvent`: Callback function called for each parsed event

### Methods

#### feed(chunk)

Feed stdout chunk to the parser.

```javascript
claudeProcess.stdout.on('data', (chunk) => {
  handler.feed(chunk);
});
```

**Parameters:**
- `chunk` (string): Raw stdout data from Claude CLI

**Behavior:**
- Accumulates incomplete lines in buffer
- Parses complete JSON lines
- Emits structured events via onEvent callback

### Event Types

ClaudeStreamHandler emits these event types via onEvent callback:

#### message_start
```javascript
{
  type: 'message_start',
  message: { id: 'msg_...', ... },
  ttft_ms: 2607  // Time to first token
}
```

#### text_delta
```javascript
{
  type: 'text_delta',
  index: 0,      // Content block index
  text: 'Hello'  // Text chunk (may be partial word)
}
```

#### thinking_delta
```javascript
{
  type: 'thinking_delta',
  index: 0,
  thinking: '...'  // Extended thinking content
}
```

#### tool_use_start
```javascript
{
  type: 'tool_use_start',
  index: 0,
  id: 'toolu_abc123',
  name: 'Bash'
}
```

#### tool_input_delta
```javascript
{
  type: 'tool_input_delta',
  index: 0,
  partial: '{"command":'  // Partial JSON
}
```

#### tool_use
```javascript
{
  type: 'tool_use',
  index: 0,
  id: 'toolu_abc123',
  name: 'Bash',
  input: { command: 'ls -la' }  // Parsed JSON
}
```

#### turn_end
```javascript
{
  type: 'turn_end',
  stopReason: 'end_turn',  // or 'tool_use', 'max_tokens', etc.
  result: 'Final response text',
  usage: { input_tokens: 100, output_tokens: 50 }
}
```

#### message_stop
```javascript
{
  type: 'message_stop',
  stopReason: 'end_turn'
}
```

#### system
```javascript
{
  type: 'system',
  subtype: 'init',  // or 'hook_started', 'hook_response', etc.
  data: { ... }
}
```

#### unknown_message
```javascript
{
  type: 'unknown_message',
  message: { ... }  // Original unrecognized message
}
```

#### error
```javascript
{
  type: 'error',
  error: Error,
  message: 'Parse error: ...',
  raw: 'invalid json line'
}
```

### Usage in DirectClaudeSpawner

```javascript
// DirectClaudeSpawner uses ClaudeStreamHandler internally:

const handler = new ClaudeStreamHandler({
  onEvent: (event) => this.handleStreamEvent(userId, event)
});

child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => handler.feed(chunk));
```

---

## Stream-JSON Protocol

Claude CLI uses NDJSON (newline-delimited JSON) protocol when called with:
```bash
claude --print --input-format=stream-json --output-format=stream-json
```

### Input Format (stdin)

**User prompt:**
```json
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Hello"}]}}
```

**Tool result:**
```json
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_123","content":"Output","is_error":false}]}}
```

### Output Format (stdout)

**System init:**
```json
{"type":"system","subtype":"init","data":{"model":"kiro-claude-sonnet-4.5",...}}
```

**Message start:**
```json
{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg_123",...}}}
```

**Text delta:**
```json
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}}
```

**Tool use:**
```json
{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_123","name":"Bash","input":{}}}}
```

**Turn end:**
```json
{"type":"result","stop_reason":"end_turn","result":"Response text","usage":{...}}
```

---

## Configuration Files

### Settings.json Location

**Default path:** `~/.claude/settings.json`

**Structure:**
```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "kv-...",
    "ANTHROPIC_BASE_URL": "http://localhost:3847",
    "ANTHROPIC_MODEL": "kiro-claude-sonnet-4.5",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "kiro-claude-sonnet-4.5",
    "ANTHROPIC_SMALL_FAST_MODEL": "kiro-claude-haiku-4.5"
  }
}
```

**Why explicit loading is needed:**

When you run `claude` manually in terminal:
1. Claude CLI automatically loads settings.json
2. Merges env object into process environment
3. Uses those env vars for authentication

When spawned via Node.js:
1. Only inherits process.env from parent
2. Does NOT load settings.json automatically
3. Results in authentication failures if not explicitly loaded

DirectClaudeSpawner solves this by:
- Loading settings.json via `loadClaudeSettings()`
- Merging env vars via `buildEnvironment()`
- Applying constructor overrides on top

---

## Testing

See `tests/` directory for working examples:

**Basic spawn & prompt:**
```bash
node tests/test-basic-prompt.js
```

**Tool execution flow:**
```bash
node tests/test-tool-use.js
```

**Multi-turn conversation:**
```bash
node tests/test-multi-turn.js
```

All tests pass with real kreova endpoint responses (~2.2s per turn).

---

## Troubleshooting

### Authentication Errors (401)

**Symptom:** `401 Invalid Authorization format`

**Cause:** Subprocess not loading settings.json

**Solution:**
1. Check `~/.claude/settings.json` exists
2. Verify ANTHROPIC_AUTH_TOKEN is set
3. Check debug logs: `spawner.on('debug', console.log)`
4. Verify constructor not overriding with wrong values

### Wrong Model Selected

**Symptom:** Init message shows wrong model (e.g., claude-sonnet-4-6 instead of kiro-claude-sonnet-4.5)

**Cause:** ANTHROPIC_MODEL not set in environment

**Solution:**
1. Add to settings.json: `"ANTHROPIC_MODEL": "kiro-claude-sonnet-4.5"`
2. Or pass in constructor: `new DirectClaudeSpawner({ model: '...' })`

### Subprocess Hangs/Timeout

**Symptom:** Session never emits events, timeout after 10s

**Cause:** Claude CLI not found, or spawn error

**Solution:**
1. Verify Claude CLI installed: `which claude`
2. Check spawn logs: `spawner.on('debug', console.log)`
3. Check stderr: `spawner.on('stderr', console.error)`

### Missing Turn-End Event

**Symptom:** Test hangs waiting for turn-end

**Cause:** Old version of stream-handler not handling result messages

**Solution:**
- Ensure stream-handler.js handles `type: 'result'` messages
- Update to latest version (Phase 3 complete)

---

## API Reference Summary

### DirectClaudeSpawner

**Constructor:**
- `new DirectClaudeSpawner(options)`

**Methods:**
- `createSession(userId, options)` → Promise<Session>
- `sendMessage(userId, prompt, options)` → Promise<void>
- `sendPrompt(userId, text)` → void
- `sendToolResult(userId, toolUseId, content, isError)` → void
- `closeSession(userId)` → Promise<void>
- `getSessionStatus(userId)` → Status | null
- `getAllSessions()` → Status[]
- `closeAll()` → Promise<void>

**Events:**
- `session-created({ userId })`
- `session-closed({ userId, code, signal })`
- `text({ userId, text })`
- `thinking({ userId, thinking })`
- `tool-use({ userId, tool })`
- `turn-end({ userId, stopReason })`
- `debug(message)`
- `stderr({ userId, data })`
- `error({ userId, error })`

### ClaudeStreamHandler

**Constructor:**
- `new ClaudeStreamHandler({ onEvent })`

**Methods:**
- `feed(chunk)` → void

**Event Types:**
- message_start, text_delta, thinking_delta
- tool_use_start, tool_input_delta, tool_use
- turn_end, message_stop
- system, unknown_message, error

---

## License

MIT
