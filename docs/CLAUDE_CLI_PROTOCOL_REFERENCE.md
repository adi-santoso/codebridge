# Claude CLI Protocol Reference
## The Definitive Guide to `claude-stream-json` Integration

**Document Version:** 1.0  
**Last Updated:** 2024  
**Source Analysis:** open-design repository (apps/daemon/src/runtimes/)

---

## 1. Overview & Introduction

### What is `claude-stream-json`?

Claude Code CLI uses a proprietary streaming protocol called **`claude-stream-json`** (also referred to as `stream-json` in contexts) that is fundamentally different from the Anthropic Messages API or any JSON-RPC protocol.

This protocol enables:
- **Bidirectional JSONL streaming** over stdin/stdout
- **Multi-turn conversations** without re-spawning the process
- **Real-time streaming** of assistant responses with partial messages
- **Tool use coordination** with streaming tool input JSON
- **Session persistence** across multiple user turns

### Key Characteristics

| Aspect | Description |
|--------|-------------|
| **Transport** | stdin (input) / stdout (output) |
| **Format** | JSONL (JSON Lines - newline-delimited JSON objects) |
| **Direction** | Bidirectional (stdin stays open for follow-up messages) |
| **Session Model** | Persistent subprocess with `--session-id` or `--resume` |
| **Streaming** | Incremental deltas via `stream_event` wrapper |
| **CLI Flags** | `--input-format stream-json --output-format stream-json` |

### Why This Protocol Exists

Unlike traditional CLI tools that:
1. Take input via args
2. Process it
3. Print output
4. Exit

Claude CLI with `stream-json`:
1. **Stays alive** across multiple user messages
2. **Maintains conversation context** internally
3. **Streams partial responses** as they arrive from the model
4. **Supports tool use** with bidirectional coordination
5. **Manages its own session state** on disk

This design allows the daemon (or any orchestrator) to send multiple user messages into the same Claude CLI process without re-spawning, preserving the CLI's internal working memory (files read, edits made, tool history).

### Protocol Discovery

From `open-design/apps/daemon/src/runtimes/defs/claude.ts`:

```typescript
export const claudeAgentDef = {
  id: 'claude',
  name: 'Claude Code',
  bin: 'claude',
  
  // The protocol identifier
  streamFormat: 'claude-stream-json',
  
  // Prompt delivery mechanism
  promptViaStdin: true,
  promptInputFormat: 'stream-json',
  
  // CLI arguments for stream-json mode
  buildArgs: (prompt, imagePaths, extraAllowedDirs, options, runtimeContext) => {
    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose'
    ];
    
    // Enable partial message streaming (if supported)
    if (caps.partialMessages) {
      args.push('--include-partial-messages');
    }
    
    // Session continuity
    if (runtimeContext.resumeSessionId) {
      args.push('--resume', runtimeContext.resumeSessionId);
    } else if (runtimeContext.newSessionId) {
      args.push('--session-id', runtimeContext.newSessionId);
    }
    
    return args;
  },
  
  // Session management
  resumesSessionViaCli: true,
};
```

### Important Distinctions

**NOT JSON-RPC:** There are no `jsonrpc`, `id`, `method` fields. Each line is a standalone event object.

**NOT Anthropic Messages API:** The wire format wraps Anthropic's message structure but adds streaming lifecycle events.

**NOT ACP (Agent Communication Protocol):** This is Claude Code's proprietary protocol, not the MCP/ACP standard used by other agents.

---

## 2. Protocol Basics

### Transport Layer

**Input (stdin):**
- JSONL format (one JSON object per line)
- Each line is a complete, self-contained message
- Stream remains **open** after initial prompt (unlike traditional CLI tools)
- Daemon/orchestrator can write additional messages without re-spawning

**Output (stdout):**
- JSONL format (one JSON object per line)
- Mix of lifecycle events, streaming deltas, and final wrappers
- Parse line-by-line, feed to handler
- Flush any remaining buffer on process close

**Critical Insight:** The stdin does NOT close after the first message. This is the key difference from traditional CLIs.

### Message Envelope Types

Claude CLI emits several top-level message types on stdout:

```typescript
// Initialization
{ type: 'system', subtype: 'init', model: 'claude-opus-4', session_id: '...' }

// Status updates
{ type: 'system', subtype: 'status', status: 'thinking' | 'working' | ... }

// Streaming events (with --include-partial-messages)
{ type: 'stream_event', event: { /* nested event */ } }

// Final assistant message wrapper
{ type: 'assistant', message: { role: 'assistant', id: '...', content: [...], stop_reason: '...' } }

// Final result/usage
{ type: 'result', usage: {...}, total_cost_usd: 0.05, stop_reason: 'end_turn' }

// User message echo (from prior turns)
{ type: 'user', message: { role: 'user', content: [...] } }
```

### Streaming vs Non-Streaming Mode

**With `--include-partial-messages` (modern Claude Code ≥1.0.86):**
- Streaming deltas arrive in `stream_event` wrappers
- Text comes via `{ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '...' } } }`
- Tool input streams as `input_json_delta` with `partial_json` fragments
- Final `assistant` wrapper repeats the content but handler should **dedupe** it

**Without `--include-partial-messages` (older builds or flag not passed):**
- No streaming deltas
- Text arrives ONLY in final `{ type: 'assistant', message: { content: [...] } }` wrapper
- Handler must detect this and emit text from the wrapper instead

From `claude-stream.ts` lines 66-73:
```typescript
// Message ids that already streamed assistant text/thinking via
// `stream_event` deltas.
// When `--include-partial-messages` is OFF (older Claude Code, e.g. 1.0.84
// pre-flag), no deltas arrive — only the final `assistant` wrapper carries
// content. The fallback below emits that content once, but we must skip it for
// newer builds that already streamed deltas, otherwise the message would
// duplicate.
const textStreamed = new Set<string>();
```

### Process Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Spawn                                                     │
│    claude -p --input-format stream-json                     │
│           --output-format stream-json --verbose             │
│           --session-id <uuid> --permission-mode bypass      │
│                                                              │
│ 2. Read stdout: { type: 'system', subtype: 'init', ... }   │
│                                                              │
│ 3. Write stdin: { type: 'user', message: { ... } }\n       │
│                                                              │
│ 4. Read stdout: stream of events...                         │
│    - stream_event (deltas)                                  │
│    - assistant (final wrapper)                              │
│    - result (usage)                                         │
│                                                              │
│ 5a. If stop_reason == 'tool_use':                          │
│     - Keep stdin OPEN                                        │
│     - Write tool results                                     │
│     - Loop back to step 4                                    │
│                                                              │
│ 5b. If stop_reason == 'end_turn':                          │
│     - Close stdin (or keep open for multi-turn)             │
│     - Process exits gracefully                               │
│                                                              │
│ 6. Multi-turn: write another user message (step 3)         │
└─────────────────────────────────────────────────────────────┘
```

### Example: Raw stdout Stream

```jsonl
{"type":"system","subtype":"init","model":"claude-opus-4","session_id":"abc123"}
{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg_01ABC","role":"assistant"}}}
{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"I'll"}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" help"}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" you"}}}
{"type":"stream_event","event":{"type":"content_block_stop","index":0}}
{"type":"assistant","message":{"role":"assistant","id":"msg_01ABC","content":[{"type":"text","text":"I'll help you"}],"stop_reason":"end_turn"}}
{"type":"result","usage":{"input_tokens":150,"output_tokens":20},"total_cost_usd":0.005,"stop_reason":"end_turn"}
```

---

## 3. Input Format (stdin → Claude CLI)

### User Message Structure

Every message written to stdin MUST be a complete JSONL line following this structure:

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "text",
        "text": "Your prompt here"
      }
    ]
  }
}
```

**Critical:** Append `\n` after the JSON string. The CLI parses line-by-line.

### Initial Prompt Example

From `open-design/apps/daemon/src/server.ts` (lines 7523-7531):

```typescript
if (promptInputFormat === 'stream-json') {
  // Wrap the prompt as an Anthropic user message and write it as one
  // JSONL line. Do NOT close stdin: claude-code keeps reading further
  // messages until EOF, which is what lets the daemon stream more user
  // messages into the same turn. The stdin is closed on a clean terminal
  // turn (see applyClaudeStreamJsonRunBookkeeping) or when the child
  // exits (run terminates, user cancels).
  const userMessage = JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text: composed }],
    },
  });
  try {
    child.stdin.write(`${userMessage}\n`, 'utf8', markStdinWriteEnd);
  } catch (err) {
    // Swallow EPIPE here for the same reason as the listener above —
    // a fast-exiting child has already routed its failure through
    // stderr / exit handlers.
    if (err && err.code !== 'EPIPE') throw err;
  }
  run.stdinOpen = true;
}
```

### Tool Result Structure

When Claude requests tool use and you execute the tool, send results back via stdin:

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_01ABC123",
        "content": "Tool execution output here",
        "is_error": false
      }
    ]
  }
}
```

**Multiple tool results** can be in the same content array:

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_01ABC123",
        "content": "First tool result"
      },
      {
        "type": "tool_result",
        "tool_use_id": "toolu_01DEF456",
        "content": "Second tool result"
      }
    ]
  }
}
```

### When to Close stdin

From `open-design/apps/daemon/src/runtimes/chat-run-lifecycle.ts` (lines 85-109):

```typescript
export function applyClaudeStreamJsonRunBookkeeping(
  run: ClaudeStreamJsonBookkeepingRun,
  ev: unknown,
) {
  if (!ev || typeof ev !== 'object') return;
  const event = ev as {
    type?: unknown;
    name?: unknown;
    id?: unknown;
    stopReason?: unknown;
  };

  const cleanTerminalTurn =
    (event.type === 'turn_end' && event.stopReason !== 'tool_use') ||
    (event.type === 'usage' && event.stopReason !== 'tool_use');
  if (!cleanTerminalTurn) return;

  run.turnCompletedCleanly = true;
  if (run.stdinOpen) {
    if (run.child?.stdin && !run.child.stdin.destroyed) {
      try { run.child.stdin.end(); } catch {}
    }
    run.stdinOpen = false;
  }
}
```

**Rule:** Close stdin when `stop_reason` is **NOT** `'tool_use'`.

If `stop_reason === 'tool_use'`, **keep stdin open** to send tool results.

### Multi-Message Example

```javascript
const { spawn } = require('child_process');

const child = spawn('claude', [
  '-p',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--session-id', 'my-session-123'
]);

// First user message
const msg1 = JSON.stringify({
  type: 'user',
  message: {
    role: 'user',
    content: [{ type: 'text', text: 'Hello Claude!' }]
  }
});
child.stdin.write(`${msg1}\n`);

// (Wait for response, parse stop_reason)
// If stop_reason == 'end_turn', send follow-up:

const msg2 = JSON.stringify({
  type: 'user',
  message: {
    role: 'user',
    content: [{ type: 'text', text: 'Tell me more' }]
  }
});
child.stdin.write(`${msg2}\n`);

// When done with conversation:
child.stdin.end();
```

---

## 4. Output Format & Event Types (stdout from Claude CLI)

### Core Event Types

Claude CLI emits events on stdout as JSONL. Your handler must parse these line-by-line.

#### 1. `system` - Lifecycle Events

**Initialization:**
```json
{
  "type": "system",
  "subtype": "init",
  "model": "claude-opus-4",
  "session_id": "abc-123-def"
}
```

**Status Updates:**
```json
{
  "type": "system",
  "subtype": "status",
  "status": "thinking" | "working" | "initializing"
}
```

#### 2. `stream_event` - Streaming Deltas (with --include-partial-messages)

**Message Start:**
```json
{
  "type": "stream_event",
  "event": {
    "type": "message_start",
    "message": {
      "id": "msg_01ABC",
      "role": "assistant",
      "model": "claude-opus-4"
    },
    "ttft_ms": 234
  }
}
```

**Content Block Start:**
```json
{
  "type": "stream_event",
  "event": {
    "type": "content_block_start",
    "index": 0,
    "content_block": {
      "type": "text",
      "text": ""
    }
  }
}
```

**Text Delta:**
```json
{
  "type": "stream_event",
  "event": {
    "type": "content_block_delta",
    "index": 0,
    "delta": {
      "type": "text_delta",
      "text": "Hello"
    }
  }
}
```

**Thinking Delta (extended thinking):**
```json
{
  "type": "stream_event",
  "event": {
    "type": "content_block_delta",
    "index": 0,
    "delta": {
      "type": "thinking_delta",
      "thinking": "<thinking>Let me analyze...</thinking>"
    }
  }
}
```

**Tool Use Input Streaming:**
```json
{
  "type": "stream_event",
  "event": {
    "type": "content_block_start",
    "index": 1,
    "content_block": {
      "type": "tool_use",
      "id": "toolu_01ABC",
      "name": "Read"
    }
  }
}
```

```json
{
  "type": "stream_event",
  "event": {
    "type": "content_block_delta",
    "index": 1,
    "delta": {
      "type": "input_json_delta",
      "partial_json": "{\"file"
    }
  }
}
```

```json
{
  "type": "stream_event",
  "event": {
    "type": "content_block_delta",
    "index": 1,
    "delta": {
      "type": "input_json_delta",
      "partial_json": "_path\": \"src"
    }
  }
}
```

**Content Block Stop:**
```json
{
  "type": "stream_event",
  "event": {
    "type": "content_block_stop",
    "index": 1
  }
}
```

#### 3. `assistant` - Final Message Wrapper

```json
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "id": "msg_01ABC",
    "content": [
      {
        "type": "text",
        "text": "Here's the complete response"
      },
      {
        "type": "tool_use",
        "id": "toolu_01DEF",
        "name": "Read",
        "input": {
          "file_path": "src/index.ts"
        }
      }
    ],
    "stop_reason": "tool_use" | "end_turn" | "max_tokens"
  }
}
```

**Important:** If you already processed `stream_event` deltas, **do not re-emit** the text from this wrapper. Track message IDs to dedupe.

#### 4. `user` - Echo of Prior User Messages

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_01ABC",
        "content": "File contents here"
      }
    ]
  }
}
```

This appears when Claude CLI echoes back tool results you sent. Parse it to emit `tool_result` events.

From `claude-stream.ts` (lines 471-484):
```typescript
// `user` messages in a stream-json transcript are usually tool_result
// wrappers from prior turns.
if (obj.type === 'user' && isRecord(obj.message) && Array.isArray(obj.message.content)) {
  for (const block of obj.message.content) {
    if (!isRecord(block)) continue;
    if (block.type === 'tool_result') {
      onEvent({
        type: 'tool_result',
        toolUseId: block.tool_use_id,
        content: stringifyToolResult(block.content),
        isError: Boolean(block.is_error),
      });
    }
  }
  return;
}
```

#### 5. `result` - Usage & Metrics

```json
{
  "type": "result",
  "usage": {
    "input_tokens": 1250,
    "output_tokens": 340,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 800
  },
  "total_cost_usd": 0.087,
  "duration_ms": 3452,
  "stop_reason": "end_turn"
}
```

### Normalized Handler Events

The `createClaudeStreamHandler` in open-design normalizes these into a simplified event set for the UI:

```typescript
type HandlerEvent =
  | { type: 'status'; label: string; model?: string; sessionId?: string; ttftMs?: number }
  | { type: 'text_delta'; delta: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'thinking_start' }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_input_delta'; id: string; name: string; delta: string }
  | { type: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | { type: 'turn_end'; stopReason: string }
  | { type: 'usage'; usage: object; costUsd?: number; durationMs?: number; stopReason?: string }
  | { type: 'error'; message: string; code?: string }
  | { type: 'raw'; line: string };
```

---

## 5. The `createClaudeStreamHandler` Implementation

### Purpose

The handler:
1. Buffers incoming stdout chunks
2. Splits on `\n` to extract complete JSONL lines
3. Parses each line as JSON
4. Dispatches to specialized handlers based on `type`
5. Accumulates per-content-block state (for tool input streaming)
6. Deduplicates text when both deltas and final wrappers arrive
7. Emits simplified events to the UI/orchestrator

### Core Structure

From `open-design/apps/daemon/src/runtimes/claude-stream.ts`:

```typescript
export function createClaudeStreamHandler(
  onEvent: EventSink,
  options: ClaudeStreamHandlerOptions = {},
) {
  let buffer = '';

  // Per-content-block scratch, keyed by `${messageId}:${blockIndex}`.
  const blocks = new Map<string, BlockState>();
  
  // Tool uses already emitted from streamed `input_json_delta` data.
  const streamedToolUseIds = new Set<string>();
  
  // Most recent assistant message id
  let currentMessageId: string | null = null;
  
  // Message ids that already streamed text via `stream_event` deltas.
  const textStreamed = new Set<string>();
  const thinkingStreamed = new Set<string>();
  
  let currentMessageStreamedText = false;
  let currentMessageStreamedThinking = false;

  function feed(chunk: string) {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        onEvent({ type: 'raw', line });
        continue;
      }
      handleObject(obj);
    }
  }

  function flush() {
    const rem = buffer.trim();
    buffer = '';
    if (rem) {
      try {
        handleObject(JSON.parse(rem));
      } catch {
        onEvent({ type: 'raw', line: rem });
      }
    }
  }

  return { feed, flush };
}
```

### Handling System Init

```typescript
function handleObject(obj: unknown) {
  if (!isRecord(obj)) return;

  if (obj.type === 'system' && obj.subtype === 'init') {
    onEvent({
      type: 'status',
      label: 'initializing',
      model: obj.model ?? null,
      sessionId: obj.session_id ?? null,
    });
    return;
  }

  if (obj.type === 'system' && obj.subtype === 'status') {
    onEvent({ type: 'status', label: obj.status ?? 'working' });
    return;
  }
  
  // ...
}
```

### Handling stream_event

```typescript
if (obj.type === 'stream_event' && isRecord(obj.event)) {
  handleStreamEvent(obj.event);
  return;
}

function handleStreamEvent(ev: Record<string, unknown>) {
  if (ev.type === 'message_start') {
    currentMessageId = isRecord(ev.message) && typeof ev.message.id === 'string' 
      ? ev.message.id 
      : null;
    currentMessageStreamedText = false;
    currentMessageStreamedThinking = false;
    if (typeof ev.ttft_ms === 'number') {
      onEvent({ type: 'status', label: 'streaming', ttftMs: ev.ttft_ms });
    }
    return;
  }

  if (ev.type === 'content_block_start' && isRecord(ev.content_block)) {
    const key = blockKey(ev.index);
    const block = ev.content_block;
    blocks.set(key, {
      type: block.type,
      name: block.name,
      id: block.id,
      input: '',
      inputValue: 'input' in block ? block.input : undefined,
    });
    if (block.type === 'thinking') {
      onEvent({ type: 'thinking_start' });
    }
    return;
  }

  if (ev.type === 'content_block_delta' && isRecord(ev.delta)) {
    const state = blocks.get(blockKey(ev.index));
    const delta = ev.delta;

    if (delta.type === 'text_delta' && typeof delta.text === 'string') {
      if (currentMessageId) textStreamed.add(currentMessageId);
      currentMessageStreamedText = true;
      onEvent({ type: 'text_delta', delta: delta.text });
      return;
    }
    
    if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
      if (currentMessageId) thinkingStreamed.add(currentMessageId);
      currentMessageStreamedThinking = true;
      onEvent({ type: 'thinking_delta', delta: delta.thinking });
      return;
    }
    
    if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
      if (state && state.type === 'tool_use') {
        state.input += delta.partial_json;
        if (typeof state.id === 'string' && typeof state.name === 'string') {
          onEvent({
            type: 'tool_input_delta',
            id: state.id,
            name: state.name,
            delta: delta.partial_json,
          });
        }
      }
      return;
    }
  }

  if (ev.type === 'content_block_stop') {
    const key = blockKey(ev.index);
    const state = blocks.get(key);
    if (state && state.type === 'tool_use' && typeof state.id === 'string' && state.input.trim()) {
      try {
        emitToolUse(state.id, state.name, JSON.parse(state.input));
        streamedToolUseIds.add(state.id);
      } catch {
        // Fall through to the final assistant wrapper's input if the
        // streamed JSON is malformed or incomplete.
      }
    } else if (
      state &&
      state.type === 'tool_use' &&
      typeof state.id === 'string' &&
      state.inputValue !== undefined
    ) {
      emitToolUse(state.id, state.name, state.inputValue);
      streamedToolUseIds.add(state.id);
    }
    blocks.delete(key);
    return;
  }
}
```

### Handling assistant Wrapper

```typescript
// `assistant` messages are the "block finished" signal for the current
// content block. For tool_use blocks whose input finished assembling,
// emit tool_use now with the final parsed input. For text blocks, emit
// the text as a single delta — but only if no streaming deltas already
// covered it.
if (obj.type === 'assistant' && isRecord(obj.message) && Array.isArray(obj.message.content)) {
  const explicitMsgId = typeof obj.message.id === 'string' ? obj.message.id : null;
  const textMsgId = explicitMsgId ?? (currentMessageStreamedText ? currentMessageId : null);
  const thinkingMsgId = explicitMsgId ?? (currentMessageStreamedThinking ? currentMessageId : null);
  
  if (explicitMsgId) currentMessageId = explicitMsgId;
  
  const textAlreadyStreamed = textMsgId ? textStreamed.has(textMsgId) : false;
  const thinkingAlreadyStreamed = thinkingMsgId ? thinkingStreamed.has(thinkingMsgId) : false;
  
  const stopReason = typeof obj.message.stop_reason === 'string'
    ? obj.message.stop_reason
    : null;
  
  for (const block of obj.message.content) {
    if (!isRecord(block)) continue;
    
    if (block.type === 'tool_use') {
      // Skip if already emitted from streaming
      if (typeof block.id === 'string' && streamedToolUseIds.has(block.id)) {
        continue;
      }
      emitToolUse(block.id, block.name, block.input ?? null);
    } else if (
      !textAlreadyStreamed &&
      block.type === 'text' &&
      typeof block.text === 'string' &&
      block.text.length > 0
    ) {
      onEvent({ type: 'text_delta', delta: block.text });
    } else if (
      !thinkingAlreadyStreamed &&
      block.type === 'thinking' &&
      typeof block.thinking === 'string' &&
      block.thinking.length > 0
    ) {
      onEvent({ type: 'thinking_delta', delta: block.thinking });
    }
  }
  
  // Emit turn_end signal AFTER all tool_use events
  if (stopReason) {
    onEvent({ type: 'turn_end', stopReason });
  }
  
  currentMessageStreamedText = false;
  currentMessageStreamedThinking = false;
  return;
}
```

### Usage Pattern

```javascript
import { spawn } from 'child_process';
import { createClaudeStreamHandler } from './claude-stream.js';

const child = spawn('claude', ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json']);

const handler = createClaudeStreamHandler((event) => {
  switch (event.type) {
    case 'status':
      console.log(`[STATUS] ${event.label}`);
      break;
    case 'text_delta':
      process.stdout.write(event.delta);
      break;
    case 'tool_use':
      console.log(`[TOOL USE] ${event.name}`, event.input);
      // Execute tool, then send result back
      break;
    case 'turn_end':
      console.log(`[TURN END] ${event.stopReason}`);
      if (event.stopReason !== 'tool_use') {
        child.stdin.end();
      }
      break;
  }
});

child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => handler.feed(chunk));
child.on('close', () => handler.flush());

// Send initial prompt
const prompt = JSON.stringify({
  type: 'user',
  message: {
    role: 'user',
    content: [{ type: 'text', text: 'List files in src/' }]
  }
});
child.stdin.write(`${prompt}\n`);
```

---

## 6. Spawn Configuration & Process Management

### Spawn Arguments

From `open-design/apps/daemon/src/runtimes/defs/claude.ts`:

```typescript
buildArgs: (prompt, imagePaths, extraAllowedDirs = [], options = {}, runtimeContext = {}) => {
  const caps = agentCapabilities.get('claude') || {};
  
  const args = [
    '-p',                          // Prompt mode
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose'
  ];
  
  // Enable partial message streaming (if supported)
  if (caps.partialMessages) {
    args.push('--include-partial-messages');
  }
  
  // Model selection
  if (options.model && options.model !== 'default') {
    args.push('--model', options.model);
  }
  
  // Additional directories for file access
  const dirs = (extraAllowedDirs || []).filter(
    (d) => typeof d === 'string' && d.length > 0,
  );
  if (dirs.length > 0 && caps.addDir !== false) {
    args.push('--add-dir', ...dirs);
  }
  
  // Session continuity
  if (typeof runtimeContext.resumeSessionId === 'string' && runtimeContext.resumeSessionId) {
    args.push('--resume', runtimeContext.resumeSessionId);
  } else if (typeof runtimeContext.newSessionId === 'string' && runtimeContext.newSessionId) {
    args.push('--session-id', runtimeContext.newSessionId);
  }
  
  // Permission mode (bypass for daemon/automated use)
  args.push('--permission-mode', 'bypassPermissions');
  
  return args;
}
```

### Complete Spawn Example

From `open-design/apps/daemon/src/server.ts` (lines 6013-6024):

```typescript
import { spawn } from 'child_process';

child = spawn(invocation.command, invocation.args, {
  env,                              // Process environment
  stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
  cwd: effectiveCwd,                // Working directory
  shell: false,                      // Don't use shell wrapper
  detached: process.platform !== 'win32', // Process group for kill
  windowsVerbatimArguments: invocation.windowsVerbatimArguments,
});
```

### Full Working Example

```javascript
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

// Session ID for continuity
const sessionId = randomUUID();

const args = [
  '-p',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--verbose',
  '--include-partial-messages',
  '--session-id', sessionId,
  '--model', 'claude-opus-4',
  '--add-dir', '/path/to/project',
  '--permission-mode', 'bypassPermissions'
];

const child = spawn('claude', args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: '/path/to/project',
  shell: false,
  env: {
    ...process.env,
    // Additional env vars if needed
  }
});

child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');

child.on('error', (err) => {
  console.error('Spawn error:', err);
});

child.on('close', (code, signal) => {
  console.log(`Process exited: code=${code} signal=${signal}`);
});

// Handle stdout (see Section 5 for handler implementation)
child.stdout.on('data', (chunk) => {
  // Feed to createClaudeStreamHandler
});

child.stderr.on('data', (chunk) => {
  console.error('[STDERR]', chunk);
});
```

### Capability Detection

Claude CLI capabilities should be probed before spawning:

From `open-design/apps/daemon/src/runtimes/defs/claude.ts`:

```typescript
// Probe --help output to detect supported flags
helpArgs: ['-p', '--help'],
capabilityFlags: {
  '--include-partial-messages': 'partialMessages',
  '--add-dir': 'addDir',
},
```

Run `claude -p --help` and check if the output contains these flags before including them in `buildArgs`.

### Environment Variables

Claude CLI respects standard environment variables:
- `ANTHROPIC_API_KEY` - API authentication
- `ANTHROPIC_BASE_URL` - Custom API endpoint (if supported)
- `HOME` / `USERPROFILE` - For session storage location

### stdin Mode

**Critical:** stdin MUST be `'pipe'` (not `'ignore'`), and you must **not** close stdin immediately after the first write.

```javascript
// ❌ WRONG: stdin closes immediately
child.stdin.end(prompt);

// ✅ CORRECT: stdin stays open
child.stdin.write(`${promptJson}\n`);
// ... later, when turn completes with non-tool_use stop_reason:
child.stdin.end();
```

### Process Cleanup

```javascript
function killProcess(child) {
  if (!child || child.exitCode !== null) return;
  
  try {
    if (process.platform !== 'win32' && child.pid) {
      // Kill process group on Unix
      process.kill(-child.pid, 'SIGTERM');
    } else {
      // Kill single process on Windows
      child.kill('SIGTERM');
    }
  } catch (err) {
    console.error('Kill failed:', err);
  }
}

// Timeout for graceful shutdown
setTimeout(() => {
  if (child && child.exitCode === null) {
    child.kill('SIGKILL'); // Force kill
  }
}, 5000);
```

---

## 7. Complete Message Flow Example

### Scenario: User asks "List files in src/", Claude uses Read tool

#### Step 1: Spawn Process

```javascript
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const sessionId = randomUUID();

const child = spawn('claude', [
  '-p',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--verbose',
  '--include-partial-messages',
  '--session-id', sessionId,
  '--permission-mode', 'bypassPermissions'
], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: '/home/user/project',
  shell: false
});

child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
```

#### Step 2: Receive Init Event

**Claude stdout →**
```json
{"type":"system","subtype":"init","model":"claude-opus-4","session_id":"abc-123"}
```

**Handler emits:**
```javascript
{ type: 'status', label: 'initializing', model: 'claude-opus-4', sessionId: 'abc-123' }
```

#### Step 3: Send User Prompt

**Write to stdin:**
```javascript
const userMessage = JSON.stringify({
  type: 'user',
  message: {
    role: 'user',
    content: [{ type: 'text', text: 'List files in src/' }]
  }
});
child.stdin.write(`${userMessage}\n`);
```

#### Step 4: Receive Streaming Response

**Claude stdout →**
```jsonl
{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg_01ABC","role":"assistant"},"ttft_ms":450}}
{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"I'll"}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" read"}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" the"}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" directory."}}}
{"type":"stream_event","event":{"type":"content_block_stop","index":0}}
```

**Handler emits:**
```javascript
{ type: 'status', label: 'streaming', ttftMs: 450 }
{ type: 'text_delta', delta: "I'll" }
{ type: 'text_delta', delta: " read" }
{ type: 'text_delta', delta: " the" }
{ type: 'text_delta', delta: " directory." }
```

#### Step 5: Receive Tool Use

**Claude stdout →**
```jsonl
{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_01XYZ","name":"Glob"}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"pattern\":\"src"}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"/**/*\"}"}}}
{"type":"stream_event","event":{"type":"content_block_stop","index":1}}
{"type":"assistant","message":{"role":"assistant","id":"msg_01ABC","content":[{"type":"text","text":"I'll read the directory."},{"type":"tool_use","id":"toolu_01XYZ","name":"Glob","input":{"pattern":"src/**/*"}}],"stop_reason":"tool_use"}}
```

**Handler emits:**
```javascript
{ type: 'tool_input_delta', id: 'toolu_01XYZ', name: 'Glob', delta: '{"pattern":"src' }
{ type: 'tool_input_delta', id: 'toolu_01XYZ', name: 'Glob', delta: '/**/*"}' }
{ type: 'tool_use', id: 'toolu_01XYZ', name: 'Glob', input: { pattern: 'src/**/*' } }
{ type: 'turn_end', stopReason: 'tool_use' }
```

#### Step 6: Execute Tool & Send Result

```javascript
// Handler received tool_use event
// Execute the tool (pseudocode)
const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/**/*', { cwd: '/home/user/project' });
const toolResult = files.join('\n');

// Send tool result back to Claude
const toolResultMessage = JSON.stringify({
  type: 'user',
  message: {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'toolu_01XYZ',
        content: toolResult
      }
    ]
  }
});

child.stdin.write(`${toolResultMessage}\n`);
```

#### Step 7: Receive Final Response

**Claude stdout →**
```jsonl
{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg_02DEF","role":"assistant"}}}
{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Here"}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" are"}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" the"}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" files:\n"}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"- src/index.ts\n"}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"- src/utils.ts"}}}
{"type":"stream_event","event":{"type":"content_block_stop","index":0}}
{"type":"assistant","message":{"role":"assistant","id":"msg_02DEF","content":[{"type":"text","text":"Here are the files:\n- src/index.ts\n- src/utils.ts"}],"stop_reason":"end_turn"}}
{"type":"result","usage":{"input_tokens":1840,"output_tokens":85},"total_cost_usd":0.032,"stop_reason":"end_turn"}
```

**Handler emits:**
```javascript
{ type: 'text_delta', delta: 'Here' }
{ type: 'text_delta', delta: ' are' }
{ type: 'text_delta', delta: ' the' }
{ type: 'text_delta', delta: ' files:\n' }
{ type: 'text_delta', delta: '- src/index.ts\n' }
{ type: 'text_delta', delta: '- src/utils.ts' }
{ type: 'turn_end', stopReason: 'end_turn' }
{ type: 'usage', usage: { input_tokens: 1840, output_tokens: 85 }, costUsd: 0.032, stopReason: 'end_turn' }
```

#### Step 8: Close stdin (Turn Complete)

```javascript
// Handler sees stopReason: 'end_turn', NOT 'tool_use'
// Safe to close stdin now
child.stdin.end();

// Or keep open for multi-turn conversation
```

### Visual Flow Diagram

```
User Input
   ↓
┌──────────────────────────────────────────────┐
│ Your Code: spawn('claude', [...args])       │
└──────────────────────────────────────────────┘
   ↓ (stdout)
┌──────────────────────────────────────────────┐
│ {"type":"system","subtype":"init",...}      │
└──────────────────────────────────────────────┘
   ↓
┌──────────────────────────────────────────────┐
│ Your Code: stdin.write(userMessage + '\n')  │
└──────────────────────────────────────────────┘
   ↓ (stdout)
┌──────────────────────────────────────────────┐
│ stream_event → text_delta chunks            │
│ stream_event → tool_use                      │
│ assistant wrapper                            │
│ (stop_reason: "tool_use")                   │
└──────────────────────────────────────────────┘
   ↓
┌──────────────────────────────────────────────┐
│ Your Code: Execute tool                     │
│           stdin.write(toolResult + '\n')    │
└──────────────────────────────────────────────┘
   ↓ (stdout)
┌──────────────────────────────────────────────┐
│ stream_event → text_delta chunks            │
│ assistant wrapper                            │
│ (stop_reason: "end_turn")                   │
│ result (usage)                               │
└──────────────────────────────────────────────┘
   ↓
┌──────────────────────────────────────────────┐
│ Your Code: stdin.end()                      │
└──────────────────────────────────────────────┘
```

---

## 8. Multi-Turn Conversations & Session Management

### Keeping the Process Alive

The key to multi-turn conversations: **Do NOT close stdin after receiving `stop_reason: 'end_turn'`.**

```javascript
// Track whether stdin is open
let stdinOpen = true;

handler.on('turn_end', (event) => {
  if (event.stopReason === 'tool_use') {
    // Keep stdin open, send tool results
    return;
  }
  
  if (event.stopReason === 'end_turn') {
    // Turn complete, but DON'T close stdin if we want multi-turn
    // Keep stdinOpen = true
    
    // Wait for next user message...
  }
});

// Later: send follow-up message
function sendFollowUp(text) {
  if (!stdinOpen) {
    console.error('stdin already closed');
    return;
  }
  
  const msg = JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text }]
    }
  });
  
  child.stdin.write(`${msg}\n`);
}

// When conversation is truly done
function endConversation() {
  if (stdinOpen) {
    child.stdin.end();
    stdinOpen = false;
  }
}
```

### Session Persistence with `--session-id` / `--resume`

Claude CLI maintains conversation state on disk. Two modes:

#### 1. New Session

```javascript
const sessionId = randomUUID(); // Generate once per conversation

spawn('claude', [
  '-p',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--session-id', sessionId,  // <-- New session
  // ...
]);
```

This creates a new session. Claude CLI stores it internally (typically in `~/.claude/sessions/`).

#### 2. Resume Existing Session

```javascript
// Same sessionId from previous run
const sessionId = 'abc-123-def-456';

spawn('claude', [
  '-p',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--resume', sessionId,  // <-- Resume existing
  // ...
]);
```

Claude CLI loads the previous session's context (files read, edits made, tool history).

### Resume Logic from open-design

From `open-design/apps/daemon/src/agent-session-resume.ts`:

```typescript
export function resolveAgentResumeContext(
  db: Database,
  params: {
    conversationId: string;
    agentId: string;
    currentModel?: string | null;
    currentCwd?: string;
    currentAssistantMessageId?: string;
  }
): AgentResumeContext {
  // Check if we have a stored session for this (conversation, agent)
  const stored = getAgentSessionRecord(db, params.conversationId, params.agentId);
  
  if (!stored?.sessionId) {
    // No stored session → create new one
    return {
      isResuming: false,
      resumeSessionId: null,
      newSessionId: randomUUID(),
      invalidationReason: null,
    };
  }
  
  // Validate that context hasn't changed
  if (params.currentModel && stored.model && params.currentModel !== stored.model) {
    return {
      isResuming: false,
      resumeSessionId: null,
      newSessionId: randomUUID(),
      invalidationReason: 'model_changed',
    };
  }
  
  if (params.currentCwd && stored.cwd && params.currentCwd !== stored.cwd) {
    return {
      isResuming: false,
      resumeSessionId: null,
      newSessionId: randomUUID(),
      invalidationReason: 'cwd_changed',
    };
  }
  
  // Resume the stored session
  return {
    isResuming: true,
    resumeSessionId: stored.sessionId,
    newSessionId: null,
    invalidationReason: null,
  };
}
```

**Invalidation conditions:**
- Model changed
- Working directory changed
- Another agent completed a turn in the same conversation
- Session file corrupted/missing

### Multi-Turn Example

```javascript
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const readline = require('readline');

const sessionId = randomUUID();
let stdinOpen = true;
let waitingForResponse = false;

const child = spawn('claude', [
  '-p',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--session-id', sessionId,
  '--permission-mode', 'bypassPermissions'
]);

const handler = createClaudeStreamHandler((event) => {
  if (event.type === 'text_delta') {
    process.stdout.write(event.delta);
  } else if (event.type === 'turn_end') {
    console.log(`\n[Turn ended: ${event.stopReason}]`);
    
    if (event.stopReason !== 'tool_use') {
      waitingForResponse = false;
      rl.prompt(); // Prompt for next user input
    }
  } else if (event.type === 'tool_use') {
    console.log(`\n[Tool: ${event.name}]`, event.input);
    // Execute tool and send result...
  }
});

child.stdout.on('data', (chunk) => handler.feed(chunk));
child.on('close', () => {
  console.log('Claude process closed');
  rl.close();
});

// Interactive REPL
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'You: '
});

rl.prompt();

rl.on('line', (line) => {
  const text = line.trim();
  
  if (text === '/exit') {
    console.log('Ending conversation...');
    if (stdinOpen) {
      child.stdin.end();
      stdinOpen = false;
    }
    return;
  }
  
  if (!text || waitingForResponse) {
    rl.prompt();
    return;
  }
  
  const msg = JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text }]
    }
  });
  
  child.stdin.write(`${msg}\n`);
  waitingForResponse = true;
  console.log('Claude: ');
});
```

### Session State Persistence

After each successful turn, persist the session ID to a database:

```javascript
// Pseudocode
function persistSession(conversationId, agentId, sessionId, model, cwd) {
  db.run(`
    INSERT OR REPLACE INTO agent_sessions (conversation_id, agent_id, session_id, model, cwd)
    VALUES (?, ?, ?, ?, ?)
  `, [conversationId, agentId, sessionId, model, cwd]);
}

// On next spawn for the same conversation
const stored = db.get(`
  SELECT session_id FROM agent_sessions
  WHERE conversation_id = ? AND agent_id = ?
`, [conversationId, agentId]);

const args = [
  '-p',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json'
];

if (stored && stored.session_id) {
  args.push('--resume', stored.session_id);
} else {
  const newSessionId = randomUUID();
  args.push('--session-id', newSessionId);
  // Store newSessionId after successful turn
}
```

---

## 9. Tool Use Protocol

### Tool Use Flow

```
Claude decides to use a tool
   ↓
Emits tool_use in stream_event (if streaming)
   ↓
Emits tool_use in assistant wrapper (always)
   ↓
Emits turn_end with stopReason: 'tool_use'
   ↓
stdin stays OPEN
   ↓
Your code executes the tool
   ↓
Send tool_result via stdin
   ↓
Claude processes result
   ↓
Responds with text or more tool uses
```

### Tool Use Event Structure

**Streaming (if `--include-partial-messages`):**

```jsonl
{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_01ABC","name":"Read"}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"file_p"}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"ath\":\"src/"}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"index.ts\"}"}}}
{"type":"stream_event","event":{"type":"content_block_stop","index":1}}
```

**Final wrapper (always):**

```json
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "id": "msg_01XYZ",
    "content": [
      {
        "type": "text",
        "text": "I'll read that file."
      },
      {
        "type": "tool_use",
        "id": "toolu_01ABC",
        "name": "Read",
        "input": {
          "file_path": "src/index.ts"
        }
      }
    ],
    "stop_reason": "tool_use"
  }
}
```

### Normalized Handler Event

```javascript
{
  type: 'tool_use',
  id: 'toolu_01ABC',
  name: 'Read',
  input: {
    file_path: 'src/index.ts'
  }
}
```

### Tool Result Format

**Success:**

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_01ABC",
        "content": "import express from 'express';\n\nconst app = express();\n...",
        "is_error": false
      }
    ]
  }
}
```

**Error:**

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_01ABC",
        "content": "Error: File not found: src/index.ts",
        "is_error": true
      }
    ]
  }
}
```

### Complete Tool Use Example

```javascript
const tools = {
  Read: async (input) => {
    const fs = require('fs').promises;
    try {
      const content = await fs.readFile(input.file_path, 'utf8');
      return { success: true, content };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
  
  Glob: async (input) => {
    const glob = require('glob');
    return new Promise((resolve) => {
      glob(input.pattern, (err, files) => {
        if (err) resolve({ success: false, error: err.message });
        else resolve({ success: true, content: files.join('\n') });
      });
    });
  },
  
  Bash: async (input) => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      exec(input.command, (err, stdout, stderr) => {
        if (err) {
          resolve({ success: false, error: `${stderr}\n${stdout}` });
        } else {
          resolve({ success: true, content: stdout });
        }
      });
    });
  }
};

const handler = createClaudeStreamHandler(async (event) => {
  if (event.type === 'tool_use') {
    console.log(`\n[TOOL] ${event.name}`, event.input);
    
    const toolFn = tools[event.name];
    if (!toolFn) {
      console.error(`Unknown tool: ${event.name}`);
      
      const errorResult = JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: event.id,
            content: `Error: Unknown tool ${event.name}`,
            is_error: true
          }]
        }
      });
      
      child.stdin.write(`${errorResult}\n`);
      return;
    }
    
    // Execute tool
    const result = await toolFn(event.input);
    
    const toolResult = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: event.id,
          content: result.success ? result.content : result.error,
          is_error: !result.success
        }]
      }
    });
    
    child.stdin.write(`${toolResult}\n`);
    console.log(`[TOOL RESULT SENT] ${result.success ? 'success' : 'error'}`);
  }
  
  // ... handle other event types
});
```

### Multiple Concurrent Tool Uses

Claude may request multiple tools in one turn:

```json
{
  "type": "assistant",
  "message": {
    "content": [
      {
        "type": "tool_use",
        "id": "toolu_01ABC",
        "name": "Read",
        "input": { "file_path": "src/index.ts" }
      },
      {
        "type": "tool_use",
        "id": "toolu_02DEF",
        "name": "Read",
        "input": { "file_path": "src/utils.ts" }
      }
    ],
    "stop_reason": "tool_use"
  }
}
```

**Send all results in a single message:**

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_01ABC",
        "content": "// index.ts contents..."
      },
      {
        "type": "tool_result",
        "tool_use_id": "toolu_02DEF",
        "content": "// utils.ts contents..."
      }
    ]
  }
}
```

### Tool Execution Best Practices

1. **Execute tools in parallel** when possible:
   ```javascript
   const results = await Promise.all(
     toolUses.map(tool => executeTool(tool))
   );
   ```

2. **Handle timeouts:**
   ```javascript
   const timeout = (ms) => new Promise((_, reject) => 
     setTimeout(() => reject(new Error('Timeout')), ms)
   );
   
   const result = await Promise.race([
     executeTool(tool),
     timeout(30000) // 30 second timeout
   ]).catch(err => ({
     success: false,
     error: err.message
   }));
   ```

3. **Sanitize file paths:**
   ```javascript
   function sanitizePath(filePath) {
     const path = require('path');
     const resolved = path.resolve(basePath, filePath);
     if (!resolved.startsWith(basePath)) {
       throw new Error('Path traversal detected');
     }
     return resolved;
   }
   ```

4. **Limit output size:**
   ```javascript
   const MAX_OUTPUT = 100000; // 100KB
   if (output.length > MAX_OUTPUT) {
     output = output.slice(0, MAX_OUTPUT) + '\n... (truncated)';
   }
   ```

---

## 10. Error Handling & Edge Cases

### Error Types

#### 1. Spawn Errors

```javascript
child.on('error', (err) => {
  console.error('Failed to spawn Claude CLI:', err.message);
  
  if (err.code === 'ENOENT') {
    console.error('Claude CLI not found in PATH');
  } else if (err.code === 'EACCES') {
    console.error('Permission denied');
  }
});
```

#### 2. Process Exit Errors

```javascript
child.on('close', (code, signal) => {
  if (code !== 0 && code !== null) {
    console.error(`Claude exited with code ${code}`);
    
    // Common exit codes
    if (code === 1) {
      console.error('General error (check stderr)');
    } else if (code === 2) {
      console.error('Invalid arguments');
    } else if (code === 130) {
      console.error('Interrupted by user (Ctrl+C)');
    }
  }
  
  if (signal) {
    console.error(`Claude killed by signal: ${signal}`);
  }
});
```

#### 3. stderr Output

Always monitor stderr for error messages:

```javascript
let stderrBuffer = '';

child.stderr.on('data', (chunk) => {
  stderrBuffer += chunk;
  console.error('[STDERR]', chunk);
  
  // Check for auth errors
  if (chunk.includes('ANTHROPIC_API_KEY')) {
    console.error('Missing API key!');
  }
  
  // Check for quota errors
  if (chunk.includes('rate limit') || chunk.includes('quota')) {
    console.error('API quota exceeded');
  }
});
```

#### 4. Malformed JSON

```javascript
function feed(chunk: string) {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (err) {
      console.error('Failed to parse JSON:', line);
      onEvent({ type: 'raw', line }); // Pass through as raw
      continue;
    }
    
    handleObject(obj);
  }
}
```

#### 5. Stream Errors

```javascript
if (obj.type === 'assistant' && typeof obj.error === 'string' && obj.error.trim()) {
  onEvent({
    type: 'error',
    message: assistantText(obj.message.content) || obj.error,
    code: obj.error,
  });
}
```

### Common Error Scenarios

#### Authentication Error

**stderr:**
```
Error: ANTHROPIC_API_KEY environment variable not set
```

**Handler:**
```javascript
child.stderr.on('data', (chunk) => {
  if (chunk.includes('ANTHROPIC_API_KEY')) {
    throw new Error('Claude CLI authentication required. Set ANTHROPIC_API_KEY environment variable.');
  }
});
```

#### Invalid Model

**stderr:**
```
Error: Unknown model: gpt-4
```

**Solution:** Use Claude models only (`claude-opus-4`, `claude-sonnet-4`, etc.)

#### Quota Exceeded

**stderr or stdout:**
```json
{"type":"assistant","error":"rate_limit_exceeded","message":{"content":[{"type":"text","text":"Rate limit exceeded"}]}}
```

**Handler:**
```javascript
if (event.type === 'error' && event.message?.includes('rate limit')) {
  // Implement exponential backoff
  await delay(Math.pow(2, retryCount) * 1000);
  retry();
}
```

#### stdin Closed Prematurely

```javascript
try {
  child.stdin.write(`${message}\n`);
} catch (err) {
  if (err.code === 'EPIPE') {
    console.error('stdin closed unexpectedly - process may have crashed');
  }
}
```

### Timeout Handling

```javascript
const INACTIVITY_TIMEOUT = 2 * 60 * 1000; // 2 minutes
let activityTimer;

function noteActivity() {
  if (activityTimer) clearTimeout(activityTimer);
  
  activityTimer = setTimeout(() => {
    console.error('Claude CLI inactive for 2 minutes, killing process');
    child.kill('SIGTERM');
    
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }, 5000);
  }, INACTIVITY_TIMEOUT);
}

// Reset timer on every stdout/stderr activity
child.stdout.on('data', noteActivity);
child.stderr.on('data', noteActivity);

// Initial activity
noteActivity();
```

### Graceful Shutdown

```javascript
function shutdown() {
  console.log('Shutting down...');
  
  // Close stdin first
  if (!child.stdin.destroyed) {
    child.stdin.end();
  }
  
  // Give process time to exit gracefully
  setTimeout(() => {
    if (child.exitCode === null) {
      console.log('Sending SIGTERM...');
      child.kill('SIGTERM');
      
      setTimeout(() => {
        if (child.exitCode === null) {
          console.log('Force killing with SIGKILL...');
          child.kill('SIGKILL');
        }
      }, 5000);
    }
  }, 3000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

### Edge Cases

#### Empty Output

If Claude produces no output:

```javascript
let hasOutput = false;

handler.on('text_delta', () => {
  hasOutput = true;
});

child.on('close', (code) => {
  if (code === 0 && !hasOutput) {
    console.error('Claude exited successfully but produced no output');
  }
});
```

#### Duplicate Messages

The handler deduplicates streaming text vs final wrapper. If implementing your own handler:

```javascript
const textStreamed = new Set(); // Track message IDs

// On streaming delta
if (delta.type === 'text_delta') {
  textStreamed.add(currentMessageId);
  emit(delta.text);
}

// On assistant wrapper
if (obj.type === 'assistant') {
  const msgId = obj.message.id;
  if (!textStreamed.has(msgId)) {
    // Only emit if NOT already streamed
    emit(obj.message.content);
  }
}
```

#### Tool Result Before tool_use Event

If using async handlers, ensure tool results are sent AFTER receiving `tool_use`:

```javascript
const pendingTools = new Map();

handler.on('tool_use', async (event) => {
  const result = await executeTool(event);
  
  // Ensure we don't send result before turn_end is processed
  await new Promise(resolve => setImmediate(resolve));
  
  sendToolResult(event.id, result);
});
```

### Recovery Strategies

#### Detect and Reseed on Session Corruption

```javascript
child.on('close', (code) => {
  if (code !== 0 && sessionId) {
    console.log('Clearing corrupted session...');
    deleteSession(sessionId);
    
    // Next spawn will create a new session
  }
});
```

#### Retry with Exponential Backoff

```javascript
async function spawnWithRetry(maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await spawnClaude();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      
      const delay = Math.pow(2, i) * 1000;
      console.log(`Spawn failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

---

## 11. Appendix: Complete Working Implementation

See the open-design repository for production-ready implementation:
- `apps/daemon/src/runtimes/claude-stream.ts` - Stream handler
- `apps/daemon/src/runtimes/defs/claude.ts` - Agent definition
- `apps/daemon/src/runtimes/chat-run-lifecycle.ts` - stdin close logic
- `apps/daemon/src/server.ts` - Spawn and orchestration

### Quick Reference

| Concept | Key Points |
|---------|-----------|
| **Protocol** | JSONL over stdin/stdout, bidirectional |
| **Stdin** | Stays open, close on `stop_reason !== 'tool_use'` |
| **Flags** | `--input-format stream-json --output-format stream-json` |
| **Streaming** | Use `--include-partial-messages` for deltas |
| **Session** | `--session-id <uuid>` (new) or `--resume <id>` (continue) |
| **Tool Flow** | tool_use event → execute → send tool_result → repeat |
| **Multi-turn** | Don't close stdin, send another user message |
| **Events** | `system`, `stream_event`, `assistant`, `user`, `result` |

### Common Gotchas

1. **Don't close stdin after first message** - It's not a one-shot CLI
2. **Dedupe text from stream_event vs assistant wrapper** - Check message IDs
3. **Keep stdin open on `stop_reason: 'tool_use'`** - Send tool results back
4. **Use `--include-partial-messages`** if available - Better UX
5. **Always append `\n` to stdin writes** - JSONL format
6. **Monitor both stdout AND stderr** - Errors may appear on either
7. **Session invalidation** - Model/cwd changes require new session
8. **Handle EPIPE gracefully** - Process may exit before stdin write completes

---

**End of Document**

For questions or issues, refer to:
- open-design repository: https://github.com/anthropics/open-design
- Claude Code documentation: https://docs.anthropic.com/claude-code

