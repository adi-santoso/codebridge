# CodeBridge - WhatsApp to Claude Code Bridge

Bridge untuk menghubungkan WhatsApp dengan Claude Code, memungkinkan coding via chat WhatsApp.

## ✅ Implementation Status

- ✅ **Phase 1**: Claude Code Session Management - COMPLETE
- ✅ **Phase 2**: WhatsApp Integration - COMPLETE
- 🚧 **Phase 3**: Production Ready (upcoming)

## Quick Start

### Phase 1: Claude Session Management (✅ Complete)

Test Claude Code integration:

```bash
npm run test:phase1
```

### Phase 2: WhatsApp Integration (✅ Complete)

Test message handling (mock WhatsApp):

```bash
npm run test:phase2
```

### Run Full Bridge

Start the WhatsApp-to-Claude bridge:

```bash
npm start
```

On first run, scan the QR code with WhatsApp to authenticate.

## Architecture

```
┌──────────────────────────────────────────────┐
│ WhatsApp Client (whatsapp-web.js)           │
│ - QR authentication                          │
│ - Message send/receive                       │
└──────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────┐
│ CodeBridge Core                              │
│ - MessageHandler: Route messages             │
│ - SessionManager: Per-user sessions          │
│ - Commands: /start, /reset, /help           │
└──────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────┐
│ Claude Code (claude-agent-acp)               │
│ - ACPClient: Subprocess wrapper              │
│ - JSON-RPC communication                     │
│ - Custom model endpoint support              │
└──────────────────────────────────────────────┘
```

## Features

- **Multi-user Support**: Setiap nomor WhatsApp punya session Claude terpisah
- **Multi-turn Conversation**: Context conversation tersimpan per session
- **Command System**: `/start`, `/reset`, `/help` commands
- **Custom Model**: Support untuk custom Anthropic-compatible endpoints
- **Auto Cleanup**: Session management dengan graceful shutdown
- **Notification Streaming**: Real-time response dari Claude

## Directory Structure

```
codebridge/
├── src/
│   ├── claude/                 # Claude Code integration
│   │   ├── acp-client.js       # claude-agent-acp wrapper
│   │   └── session-manager.js  # Session management API
│   ├── whatsapp/               # WhatsApp integration
│   │   ├── client.js           # WhatsApp client wrapper
│   │   └── message-handler.js  # Message routing
│   ├── utils/
│   │   ├── config.js           # Configuration
│   │   └── logger.js           # Logging utility
│   ├── bridge.js               # Main bridge coordinator
│   └── index.js                # Entry point
├── examples/
│   ├── phase1-demo.js          # Claude session test
│   └── phase2-demo.js          # WhatsApp integration test
├── tests/
│   └── test-claude-agent-acp.js
├── package.json
├── CLAUDE.md
└── README.md
```

## Installation

```bash
# Clone repository
git clone https://github.com/adi-santoso/codebridge.git
cd codebridge

# Install dependencies
npm install
```

## Configuration

Edit `src/utils/config.js` untuk custom settings:

```javascript
export const config = {
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY || 'your-api-key',
    baseUrl: process.env.ANTHROPIC_BASE_URL || 'http://127.0.0.1:3847/',
    model: process.env.CLAUDE_MODEL || 'kiro-claude-sonnet-4.5',
  },
  session: {
    defaultMode: 'bypassPermissions',
    timeout: 300000,  // 5 minutes
    maxRetries: 3,
  },
};
```

## WhatsApp Commands

### System Commands
- `/start` - Welcome message dan intro
- `/reset` - Reset session (start fresh)
- `/help` - Show available commands

### Coding via Chat
Just send normal messages:

```
User: "Hello! Can you help me create a React component?"
Claude: [Creates React component code...]

User: "Can you add TypeScript types to it?"
Claude: [Adds TypeScript types...]
```

Multi-turn conversation dengan context preservation!

## Technical Details

### Phase 1: Claude Session Management

**File: `src/claude/acp-client.js`**
- Spawns `claude-agent-acp` as Node.js subprocess
- JSON-RPC 2.0 communication over stdio
- Handles notifications for streaming responses
- Custom model endpoint support

**File: `src/claude/session-manager.js`**
- High-level API for per-user sessions
- Session lifecycle: create → message → cleanup
- Maps userId (phone) to Claude session

### Phase 2: WhatsApp Integration

**File: `src/whatsapp/client.js`**
- Uses `whatsapp-web.js` for WhatsApp connection
- QR code authentication
- Message send/receive handlers

**File: `src/whatsapp/message-handler.js`**
- Routes messages to appropriate handlers
- Command parsing (`/start`, `/reset`, `/help`)
- Extracts Claude response from notifications
- Typing indicators

**File: `src/bridge.js`**
- Coordinates WhatsApp ↔ Claude
- Handles startup/shutdown
- Status monitoring

## Development

```bash
# Run Phase 1 test (Claude only)
npm run test:phase1

# Run Phase 2 test (Mock WhatsApp)
npm run test:phase2

# Run full integration test
npm run test:acp

# Start development mode with watch
npm run dev

# Lint code
npm run lint
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
