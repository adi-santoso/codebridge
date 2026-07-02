# CodeBridge - WhatsApp to Claude Code Bridge

Bridge untuk menghubungkan WhatsApp (via Baileys) dengan Claude Code, memungkinkan coding via chat WhatsApp.

## Architecture

```
┌──────────────────────────────────────────────┐
│ Baileys Gateway (External)                   │
│ - WhatsApp session management                │
│ - QR scan & authentication                   │
└──────────────────────────────────────────────┘
                    ↓ HTTP/WebSocket
┌──────────────────────────────────────────────┐
│ CodeBridge MCP Server                        │
│ - Session management per user                │
│ - Project switching                          │
│ - Command parsing & routing                  │
│ - Auto cleanup idle sessions                 │
└──────────────────────────────────────────────┘
                    ↓ MCP Protocol
┌──────────────────────────────────────────────┐
│ Claude Code Instances                        │
│ - Per user/project isolation                 │
│ - File operations & code execution           │
└──────────────────────────────────────────────┘
```

## Features

- **Multi-user Support**: Setiap nomor WhatsApp punya session Claude terpisah
- **Project Switching**: Ganti project dengan command `/switch`
- **Session Persistence**: Context conversation tersimpan
- **Auto Cleanup**: Instance idle otomatis dibersihkan (configurable)
- **Security**: Whitelist nomor yang allowed
- **Command System**: Built-in commands untuk management

## Directory Structure

```
codebridge/
├── src/
│   ├── mcp-server/           # MCP server core
│   │   ├── server.js         # Main MCP server
│   │   ├── tools.js          # MCP tools definition
│   │   └── resources.js      # MCP resources definition
│   ├── whatsapp/             # WhatsApp integration
│   │   ├── client.js         # Baileys client wrapper
│   │   └── webhook.js        # Webhook handler (optional)
│   ├── claude/               # Claude Code management
│   │   ├── instance.js       # Claude process manager
│   │   └── session.js        # Session state manager
│   ├── commands/             # Command handlers
│   │   ├── index.js          # Command parser
│   │   ├── project.js        # Project commands
│   │   └── system.js         # System commands
│   └── utils/
│       ├── message-queue.js  # Message queue
│       ├── logger.js         # Logging utility
│       └── config.js         # Config loader
├── config/
│   ├── projects.json         # Project paths configuration
│   ├── settings.json         # Bridge settings
│   └── .env.example          # Environment variables template
├── data/                     # Runtime data (gitignored)
│   ├── sessions/             # User sessions state
│   └── logs/                 # Application logs
├── docs/
│   ├── SETUP.md              # Setup instructions
│   ├── COMMANDS.md           # Available commands
│   └── ARCHITECTURE.md       # Technical architecture
├── scripts/
│   ├── start.sh              # Start script
│   ├── setup.sh              # Initial setup
│   └── pm2.config.js         # PM2 configuration
├── package.json
└── README.md
```

## Quick Start

### 1. Install Dependencies

```bash
cd codebridge
npm install
```

### 2. Configuration

```bash
# Copy environment template
cp config/.env.example .env

# Edit .env
nano .env

# Configure projects
nano config/projects.json
```

### 3. Run

```bash
# Development
npm run dev

# Production (with PM2)
npm run start:prod

# Or manual
node src/mcp-server/server.js
```

## Configuration

### Environment Variables (.env)

```env
# Baileys Gateway
BAILEYS_URL=http://localhost:3000
BAILEYS_SESSION_ID=default

# Security
ALLOWED_NUMBERS=628123456789,628987654321

# Claude Settings
CLAUDE_API_KEY=your_api_key_here
DEFAULT_MODEL=claude-3-5-sonnet-20241022

# Session Management
SESSION_IDLE_TIMEOUT=1800000        # 30 minutes in ms
SESSION_CLEANUP_INTERVAL=300000     # 5 minutes in ms
MAX_CONCURRENT_SESSIONS=10

# Logging
LOG_LEVEL=info
LOG_FILE=data/logs/codebridge.log
```

### Projects Configuration (config/projects.json)

```json
{
  "laravel-api": {
    "path": "/home/user/projects/laravel-api",
    "description": "Laravel REST API",
    "default": true
  },
  "react-dashboard": {
    "path": "/home/user/projects/react-dashboard",
    "description": "React Admin Dashboard"
  },
  "mobile-app": {
    "path": "/home/user/projects/mobile-app",
    "description": "React Native Mobile App"
  }
}
```

## WhatsApp Commands

### Project Management
- `/projects` - List all available projects
- `/switch <project>` - Switch to different project
- `/current` - Show current project info

### Session Management
- `/status` - Show session status
- `/reset` - Reset conversation context
- `/help` - Show available commands

### Coding Commands
Just send normal messages untuk coding tasks:
```
User: "fix bug di UserController line 45"
User: "tambahkan validation email di form register"
User: "refactor function getUserData jadi lebih clean"
```

## Setup with Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "codebridge": {
      "command": "node",
      "args": ["D:/working/gatrion/codebridge/src/mcp-server/server.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

## Deployment (Ubuntu Server)

### With PM2

```bash
# Install PM2
npm install -g pm2

# Start
pm2 start scripts/pm2.config.js

# Save for auto-restart
pm2 save
pm2 startup
```

### With Systemd

```bash
# Copy service file
sudo cp scripts/codebridge.service /etc/systemd/system/

# Enable and start
sudo systemctl enable codebridge
sudo systemctl start codebridge

# Check status
sudo systemctl status codebridge
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run with watch mode
npm run dev

# Lint
npm run lint
```

## Security Notes

1. **Whitelist Numbers**: Hanya nomor di `ALLOWED_NUMBERS` yang bisa akses
2. **API Keys**: Jangan commit `.env` ke git
3. **File Access**: Claude hanya bisa akses project yang dikonfigurasi
4. **Rate Limiting**: Implement rate limiting untuk prevent abuse

## Troubleshooting

### Claude instance tidak start
- Check `CLAUDE_API_KEY` valid
- Check disk space untuk session storage
- Check logs: `tail -f data/logs/codebridge.log`

### WhatsApp tidak connect
- Check `BAILEYS_URL` accessible
- Check Baileys gateway running
- Verify `BAILEYS_SESSION_ID` exists di gateway

### Memory usage tinggi
- Turunkan `MAX_CONCURRENT_SESSIONS`
- Turunkan `SESSION_IDLE_TIMEOUT`
- Check untuk memory leaks di logs

## Project Status

🚧 **Design Phase Complete** - Implementation belum dimulai

Lihat [ROADMAP.md](docs/ROADMAP.md) untuk detail timeline dan tasks.

## Documentation

- [Architecture Design](docs/ARCHITECTURE.md) - System architecture dan technical design
- [Setup Guide](docs/SETUP.md) - Installation dan configuration guide
- [Commands Reference](docs/COMMANDS.md) - Complete command documentation
- [Implementation Roadmap](docs/ROADMAP.md) - Development timeline dan phases

## Contributing

Project ini masih dalam tahap design. Contribution guidelines akan ditambahkan setelah MVP selesai.

## License

MIT

## Support

Issues & questions: Create an issue atau contact project maintainer.
