# CodeBridge - Quick Start Guide

**Status:** Ready to start implementation  
**Architecture:** WhatsApp Gateway → MCP Server → Claude Code CLI

---

## Prerequisites

✅ **Already Have:**
- WhatsApp Gateway running at `D:\working\gatrion\whatsapp`
- Node.js 18+
- Your phone with WhatsApp

✅ **Need to Verify:**
- Claude Code CLI installed and accessible
- Claude Code works with your custom model

---

## Project Structure

```
codebridge/
├── src/
│   ├── mcp-server/       # MCP protocol server
│   │   ├── server.js
│   │   ├── tools.js
│   │   └── handlers.js
│   ├── whatsapp/         # WhatsApp integration
│   │   ├── client.js
│   │   └── poller.js
│   ├── claude/           # Claude subprocess management
│   │   ├── instance.js
│   │   └── session.js
│   ├── commands/         # Command system
│   │   ├── parser.js
│   │   └── handlers.js
│   └── utils/            # Utilities
│       ├── config.js
│       ├── logger.js
│       ├── formatter.js
│       └── session-storage.js
├── config/
│   ├── projects.json     # Your coding projects
│   ├── settings.json     # Bridge settings
│   └── .env.example      # Environment template
├── data/
│   ├── sessions/         # User session data
│   └── logs/             # Application logs
├── tests/                # Test files
└── docs/
    └── implementation/   # Phase-by-phase guides
```

---

## Quick Setup (5 minutes)

### 1. Install Dependencies

```bash
cd codebridge
npm install
```

### 2. Configure Environment

```bash
# Copy template
cp config/.env.example .env

# Edit .env
nano .env
```

**Required variables:**
```env
# WhatsApp Gateway (from your existing gateway)
BAILEYS_URL=http://localhost:3333
WHATSAPP_API_KEY=your-api-key-from-gateway

# Claude Code CLI
CLAUDE_CLI_PATH=claude
CLAUDE_MODEL=your-custom-model

# Your test phone number
TEST_PHONE_NUMBER=628123456789
```

### 3. Configure Projects

Edit `config/projects.json`:

```json
{
  "my-project": {
    "path": "D:/working/my-project",
    "description": "My coding project",
    "default": true
  }
}
```

### 4. Start WhatsApp Gateway

```bash
# In separate terminal
cd D:\working\gatrion\whatsapp
npm start
```

---

## Implementation Timeline

### Week 1: Core Setup
- **Day 1-3:** Phase 0 - Validation (verify Claude CLI works)
- **Day 4-5:** Phase 1 - MCP Server Core

### Week 2: Integration
- **Day 1-2:** Phase 2 - WhatsApp Integration
- **Day 3-5:** Phase 3 - Session Management

### Week 3: Polish
- **Day 1-2:** Phase 4 - Command System
- **Day 3-5:** Phase 5 - Testing & Fixes

**Total: 2-3 weeks to working MVP**

---

## Development Workflow

### Start Development

```bash
# Terminal 1: WhatsApp Gateway
cd D:\working\gatrion\whatsapp
npm start

# Terminal 2: CodeBridge
cd D:\working\gatrion\codebridge
npm run dev
```

### Run Tests

```bash
# Run all tests
npm test

# Run specific phase test
node tests/phase-0-claude-test.js
node tests/phase-2-whatsapp-test.js
```

### Check Logs

```bash
# Real-time logs
tail -f data/logs/codebridge.log

# Or in PowerShell
Get-Content data/logs/codebridge.log -Wait
```

---

## Usage After MVP Complete

### 1. Scan QR Code (First Time)

Open: `http://localhost:3333/dashboard`

Scan QR code with your WhatsApp

### 2. Send Messages

**Coding Request:**
```
list files in current directory
```

**Commands:**
```
/projects
/switch my-project
/status
/help
```

### 3. Multi-Turn Conversation

```
You: create a new file hello.js with hello world
Bot: [creates file]

You: now add error handling
Bot: [updates file with error handling]
```

---

## Current Phase: Phase 0 (Validation)

**Next Steps:**

1. Read: [Phase 0 Validation Guide](./docs/implementation/PHASE_0_VALIDATION.md)
2. Test Claude Code CLI works
3. Test WhatsApp Gateway integration
4. Make GO/NO-GO decision
5. Proceed to Phase 1

---

## Need Help?

- **Phase Guides:** `docs/implementation/PHASE_*.md`
- **Architecture:** `docs/ARCHITECTURE.md`
- **Full Analysis:** `ANALYSIS.md`
- **Development Guide:** `CLAUDE.md`

---

## Success Criteria

**MVP is done when:**
- ✅ WhatsApp message → Claude response works
- ✅ Commands work (/projects, /switch, /status)
- ✅ Multiple messages maintain context
- ✅ Session persists across restarts
- ✅ Basic error handling works

**Then you can:**
- Code from anywhere via WhatsApp
- Switch between projects easily
- Get Claude's help with your custom model
- No internet needed (all local)

---

**Ready to start?** → [Begin Phase 0](./docs/implementation/PHASE_0_VALIDATION.md)
