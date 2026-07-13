# CodeBridge - WhatsApp to Claude Code Bridge

Bridge untuk menghubungkan WhatsApp dengan Claude Code, memungkinkan coding via chat WhatsApp.

## ✅ Implementation Status

- ✅ **Phase 1**: Stream Handler Implementation - COMPLETE (16/16 tests, 91% coverage)
- ✅ **Phase 2**: Direct Spawner Integration - COMPLETE
- ✅ **Phase 3**: Test Files & Settings.json Fix - COMPLETE (3/3 tests passing)
- ✅ **Phase 4**: Documentation Update - COMPLETE
- ✅ **Phase 5**: WhatsApp Integration - COMPLETE (6/6 integration tests passing)

## Quick Start

### Prerequisites

1. **Claude Code CLI** installed and configured
2. **Settings.json** configured (for custom endpoints):
   ```bash
   # Location: ~/.claude/settings.json
   {
     "env": {
       "ANTHROPIC_AUTH_TOKEN": "your-token",
       "ANTHROPIC_BASE_URL": "http://localhost:3847",
       "ANTHROPIC_MODEL": "kiro-claude-sonnet-4.5"
     }
   }
   ```

### Run Tests

```bash
# Phase 5 Integration Tests (All components)
node tests/phase5-integration.test.js

# Phase 1-3 Tests (Stream & Spawner)
node tests/test-basic-prompt.js
node tests/test-tool-use.js
node tests/test-multi-turn.js
```

All tests should pass with real responses.

## Architecture

**Current Implementation (Phase 1-3):**

```
┌───────────────────────────────────────────────┐
│ DirectClaudeSpawner (Node.js EventEmitter)   │
│ - Loads ~/.claude/settings.json              │
│ - Spawns claude CLI subprocess per user       │
│ - Event-based API (text, tool-use, turn-end) │
└─────────────────────┬─────────────────────────┘
                      │
                      │ spawn subprocess
                      ↓
     ┌────────────────────────────────────────┐
     │   Claude CLI (stream-json protocol)    │
     │   stdin: user prompts, tool results    │
     │   stdout: event stream (NDJSON)        │
     └────────────────┬───────────────────────┘
                      │
                      │ stdout chunks
                      ↓
     ┌────────────────────────────────────────┐
     │   ClaudeStreamHandler                  │
     │   - Parses NDJSON stream               │
     │   - Emits structured events            │
     │   - Handles tool_use, text_delta, etc  │
     └────────────────────────────────────────┘
```

**Future Phase 5 (WhatsApp Integration):**

```
┌─────────────────────────────────────────────┐
│ External WhatsApp Gateway (USER'S PROJECT)  │
│ - Baileys / whatsapp-web.js                 │
│ - QR authentication                         │
│ - Message send/receive                      │
│ - Socket.IO Client                          │
└──────────────────────┬──────────────────────┘
                       │
                       │ Socket.IO (codebridge:message)
                       ↓
┌─────────────────────────────────────────────┐
│ CodeBridge Socket.IO Server (IMPLEMENTED)   │
│ - ConnectionManager (auth, rate limit)      │
│ - EventHandlers (message routing)           │
│ - MessageHandler (command/prompt routing)   │
└──────────────────────┬──────────────────────┘
                       │
                       │ calls SessionManager
                       ↓
┌─────────────────────────────────────────────┐
│ SessionManager (IMPLEMENTED)                │
│ - Multiple sessions per user (SQLite)       │
│ - Session → Project mapping                 │
│ - State machine (SESSION_SELECTED →         │
│   PROJECT_SELECTED)                         │
│ - DirectClaudeSpawner per session           │
└──────────────────────┬──────────────────────┘
                       │
                       │ spawns DirectClaudeSpawner
                       ↓
┌─────────────────────────────────────────────┐
│ DirectClaudeSpawner (Phase 1-3)             │
│ - Claude CLI subprocess per session         │
│ - Event-based responses                     │
│ - Tool use event handling                   │
└──────────────────────┬──────────────────────┘
                       │
                       │ emits tool-use events
                       ↓
┌─────────────────────────────────────────────┐
│ ToolExecutor (IMPLEMENTED)                  │
│ - Execute Bash, Read, Write, Edit           │
│ - Sandboxed to project directory            │
│ - 30s timeout, path validation              │
└─────────────────────────────────────────────┘

Session Commands (IMPLEMENTED):
  /newsession     - Create new session
  /sessions       - List user's sessions
  /session <id>   - Switch to session
  /projects       - List available projects
  /project <name> - Select project
  /status         - Show session status
  /help           - Show help
```

**Key Points:**
- ❌ CodeBridge does NOT run Baileys/whatsapp-web.js
- ✅ User has separate WhatsApp Gateway project
- ✅ Socket.IO server is the interface between gateway and CodeBridge
- ✅ Supports multiple sessions per user with explicit routing

## Features

- **Event-Based API**: Non-blocking async handling with EventEmitter
- **Settings.json Loading**: Auto-inherits Claude CLI configuration
- **Custom Endpoints**: Support kreova/custom Anthropic-compatible endpoints
- **Stream-json Protocol**: Real-time streaming responses from Claude
- **Tool Execution**: Handle tool_use events (Bash, Read, Write, Edit) with sandboxing
- **Multi-turn Context**: Persistent subprocess maintains conversation history
- **Session Management**: Multiple sessions per user with SQLite persistence
- **Session Commands**: `/newsession`, `/projects`, `/project`, `/status`, etc.
- **WhatsApp Integration**: Socket.IO server for external WhatsApp gateway
- **Response Aggregation**: Buffer text deltas until turn-end for complete responses

## Usage Examples

### Example 1: Session Commands (Phase 5)

```javascript
import { SessionManager } from './src/claude/session-manager.js';
import { SessionCommands } from './src/commands/session-commands.js';

const sessionManager = new SessionManager({
  dbPath: './.codebridge/sessions.db'
});

const sessionCommands = new SessionCommands({
  sessionManager,
  projectRootPath: './projects'
});

const userId = '628123456789'; // WhatsApp number

// Create session
const result1 = await sessionCommands.execute(userId, '/newsession');
// "✅ New session created: sess_abc123"

// List projects
const result2 = await sessionCommands.execute(userId, '/projects');
// "📁 Available projects (2): my-app, my-website"

// Select project
const result3 = await sessionCommands.execute(userId, '/project my-app');
// "✅ Project selected: my-app"

// Now ready to send coding prompts!
```

### Example 2: Basic Session (Phase 1-3)

```javascript
import { DirectClaudeSpawner } from './src/claude/direct-spawner.js';

const spawner = new DirectClaudeSpawner({
  projectPath: '/path/to/project'
  // Uses ~/.claude/settings.json for auth/endpoint/model
});

// Listen for text responses
spawner.on('text', ({ userId, text }) => {
  console.log(text);
});

// Listen for turn completion
spawner.on('turn-end', ({ userId, stopReason }) => {
  console.log(`Turn ended: ${stopReason}`);
});

// Create session and send prompt
const session = await spawner.createSession('user-123');
await session.sendPrompt('List files in current directory');

// Later: close session
await spawner.closeSession('user-123');
```

### Example 2: Tool Execution Flow (Phase 5)

```javascript
import { ToolExecutor } from './src/tools/executor.js';

const executor = new ToolExecutor({
  projectPath: '/path/to/project'
});

// Bash execution
const bashResult = await executor.execute({
  name: 'Bash',
  input: { command: 'ls -la' }
});
console.log(bashResult.content);

// File write
const writeResult = await executor.execute({
  name: 'Write',
  input: { 
    file_path: 'hello.txt',
    content: 'Hello World'
  }
});

// File read
const readResult = await executor.execute({
  name: 'Read',
  input: { file_path: 'hello.txt' }
});
console.log(readResult.content); // "Hello World"

// File edit
const editResult = await executor.execute({
  name: 'Edit',
  input: {
    file_path: 'hello.txt',
    old_string: 'World',
    new_string: 'CodeBridge'
  }
});
```

### Example 3: Multi-turn Conversation

```javascript
import { DirectClaudeSpawner } from './src/claude/direct-spawner.js';

const spawner = new DirectClaudeSpawner({
  projectPath: '/path/to/project'
});

let turnCount = 0;

spawner.on('turn-end', ({ userId }) => {
  turnCount++;
  console.log(`✅ Turn ${turnCount} completed`);
});

const session = await spawner.createSession('user-123');

// Turn 1
await session.sendPrompt('What files are in this directory?');

// Wait for turn-end event, then Turn 2
await session.sendPrompt('Create a file called hello.txt');

// Turn 3
await session.sendPrompt('Show me the content of hello.txt');

// All turns maintain context!
await spawner.closeSession('user-123');
```

## Directory Structure

```
codebridge/
├── src/
│   └── claude/
│       ├── direct-spawner.js     # DirectClaudeSpawner class
│       └── stream-handler.js     # ClaudeStreamHandler class
├── tests/
│   ├── test-basic-prompt.js      # Test 1: Basic spawn & prompt
│   ├── test-tool-use.js          # Test 2: Tool execution flow
│   ├── test-multi-turn.js        # Test 3: Multi-turn conversation
│   └── fixtures/
│       └── test-project/         # Test project directory
├── docs/
│   ├── phase1-complete.md        # Phase 1 documentation
│   ├── phase2-complete.md        # Phase 2 documentation
│   ├── phase3-complete.md        # Phase 3 documentation
│   ├── ARCHITECTURE.md           # Architecture design doc
│   └── NEXT_STEPS.md             # Implementation plan
├── package.json
├── CLAUDE.md
└── README.md
```

## Troubleshooting

### Claude subprocess fails to spawn

**Error:** `'node' is not recognized`

**Solution:** Direct JS file execution:
```javascript
const scriptPath = 'node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js';
spawn('node', [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });
```

### WhatsApp QR code not showing

Check that `whatsapp-web.js` is installed:
```bash
npm install whatsapp-web.js qrcode-terminal
```

### Session timeout

Increase timeout in `src/utils/config.js`:
```javascript
session: {
  timeout: 600000,  // 10 minutes
}
```

## Roadmap

- ✅ Phase 1: Claude Code subprocess integration
- ✅ Phase 2: WhatsApp message routing
- 🚧 Phase 3: Production ready
  - Environment variables
  - Error recovery
  - Session persistence
  - Rate limiting
  - Logging improvements

## License

MIT

## Contributing

Project ini masih dalam early development. Contributions welcome!

## Support

Issues & questions: Create an issue di GitHub.
