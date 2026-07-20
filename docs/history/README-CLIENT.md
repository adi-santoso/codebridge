# CodeBridge - Gateway Client Mode

CodeBridge sekarang berjalan sebagai **Socket.IO Client** yang connect ke Gateway Server.

## Quick Start

### 1. Setup Environment
```bash
# Copy .env.example to .env (if not exists)
cp .env.example .env

# Edit .env
nano .env
```

Required variables:
```env
GATEWAY_URL=https://chat.gatrion.my.id
GATEWAY_AUTH_KEY=your-secret-key
PROJECT_ROOT_PATH=D:/working/gatrion
ANTHROPIC_API_KEY=kv-...
ANTHROPIC_BASE_URL=http://127.0.0.1:3847/
```

### 2. Start CodeBridge
```bash
# Production
npm start

# Development (with auto-restart)
npm run dev
```

### 3. Verify Connection
Check logs for:
```
[GatewayClient] Connected to Gateway
[SessionRoomManager] Ready
[CodeBridge] Running...
```

## Architecture

```
WhatsApp → Gateway Server (chat.gatrion.my.id)
              ↓ (whatsapp:message)
           CodeBridge Client
              ↓
           SessionManager → Claude
              ↓ (codebridge:response)
           Gateway Server → WhatsApp
```

## Key Features

- ✅ Auto-connect to Gateway
- ✅ Auto-reconnect on disconnect
- ✅ Auto join/leave session rooms
- ✅ Event-driven message handling
- ✅ Graceful shutdown (Ctrl+C)

## Gateway Protocol

### Incoming (from Gateway)
```javascript
whatsapp:message {
  from: "628xxx",
  message: "user message",
  sessionId: "session-xxx",
  timestamp: 1234567890
}
```

### Outgoing (to Gateway)
```javascript
codebridge:response {
  sessionId: "session-xxx",
  response: "claude response",
  timestamp: 1234567890
}
```

## Room System

- Gateway uses rooms: `session-${sessionId}`
- CodeBridge auto joins on session create
- CodeBridge auto leaves on session close
- Re-joins all rooms after reconnect

## Troubleshooting

### Connection Failed
```bash
# Check Gateway is running
curl https://chat.gatrion.my.id

# Check .env
cat .env | grep GATEWAY_URL

# Check logs
tail -f logs/codebridge.log
```

### Messages Not Received
1. Verify room is joined (check logs)
2. Verify Gateway is emitting to correct room
3. Check event listener is setup

### Response Not Sent
1. Check GatewayClient.isConnected
2. Verify response format
3. Check emit event name

## Files Structure

```
src/
├── main.js                    # Entry point
├── gateway-client.js          # Socket.IO client
├── session-room-manager.js    # Room management
├── claude/
│   └── session-manager.js     # Claude sessions
├── whatsapp/
│   └── message-handler.js     # Message routing
└── archive/                   # Old server files
    ├── server-old.js
    └── socket-old/
```

## Documentation

- [GATEWAY_CLIENT_REFACTORING.md](./docs/GATEWAY_CLIENT_REFACTORING.md) - Full refactoring details
- [PHASE_5.md](./docs/PHASE_5.md) - Session management

## Commands

### Session Commands
- `/newsession` - Create new session
- `/projects` - List available projects
- `/project <name>` - Select project
- `/sessions` - List your sessions
- `/closesession` - Close active session

### System Commands
- Ctrl+C - Graceful shutdown

## License

MIT
