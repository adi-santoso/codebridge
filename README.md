# CodeBridge

WhatsApp → Claude Code bridge. Code from chat.

CodeBridge is a **Socket.IO client**. An external WhatsApp Gateway (Baileys) owns the WhatsApp session; CodeBridge owns Claude sessions, tools, and slash commands.

## Status

| Area | State |
|------|--------|
| Claude CLI spawn + stream-json | ✅ Done |
| Session manager + SQLite | ✅ Done |
| Gateway client + room join | ✅ Done |
| Tool execution (Bash/Read/Write/Edit) | ✅ Done |
| Command system (45 commands, phases 1–9) | ✅ Done |
| Response chunking / timeout / whitelist | ✅ Done |
| Production multi-tenant harden | ⚠️ Partial (see Security) |

Historical design docs that claimed “not implemented” live in `docs/history/`.

## Architecture

```
WhatsApp user
    → External Gateway (Socket.IO server)
    → CodeBridge GatewayClient
    → MessageHandler
         /cmd  → CommandHandler
         text  → SessionManager → DirectClaudeSpawner → Claude CLI
                                      ↓ tool-use
                                 ToolExecutor
    → codebridge:response → Gateway → user
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Prerequisites

1. **Node.js 18+**
2. **Claude Code CLI** on `PATH`, working with your model/endpoint
3. Optional: `~/.claude/settings.json` for token / base URL / model
4. **WhatsApp Gateway** reachable (e.g. `GATEWAY_URL`)

## Quick start

```bash
cp .env.example .env
# edit GATEWAY_URL, GATEWAY_AUTH_KEY, ALLOWED_WHATSAPP_NUMBERS, PROJECT_ROOT_PATH

npm install
npm start
# or: npm run dev
# or: pm2 start ecosystem.config.cjs
```

### Minimal `.env`

```env
GATEWAY_URL=https://your-gateway.example
GATEWAY_AUTH_KEY=change-me
GATEWAY_SESSIONS=          # optional room IDs to join on boot
PROJECT_ROOT_PATH=/path/to/projects
SESSION_DB_PATH=./.codebridge/sessions.db
ALLOWED_WHATSAPP_NUMBERS=628xxxxxxxxxx
MAX_CONCURRENT_SESSIONS=10
```

Claude auth often comes from `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "your-token",
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:3847",
    "ANTHROPIC_MODEL": "your-model-id"
  }
}
```

Full setup: [docs/SETUP.md](docs/SETUP.md)

## WhatsApp usage

1. Message must be from a whitelisted number
2. `/newsession` → `/projects` → `/project <name>`
3. Send normal coding prompts
4. Slash commands for control (session, files, tools, templates, admin)

Command reference: [docs/COMMANDS.md](docs/COMMANDS.md)

### Command groups (45)

| Group | Examples |
|-------|----------|
| General | `/help` `/ping` `/version` `/status` |
| Session | `/newsession` `/sessions` `/session` `/reset` `/history` `/save` `/load` |
| Project | `/projects` `/project` |
| Tools | `/tools` `/allow` `/deny` `/cancel` `/retry` `/toollog` |
| Files | `/ls` `/cat` `/tree` `/search` `/diff` |
| Response | `/brief` `/balanced` `/detailed` `/code-only` `/explain-only` |
| Context | `/focus` `/context` `/ignore` |
| Templates | `/ask` `/fix` `/review` `/test` `/doc` `/refactor` |
| Debug | `/debug` `/errors` `/logs` `/metrics` |
| Admin | `/admin ...` (RBAC) |

## Project layout

```
src/
  main.js                 # entry
  gateway-client.js       # Socket.IO client
  session-room-manager.js
  whatsapp/message-handler.js
  claude/
    session-manager.js
    direct-spawner.js
    stream-handler.js
  commands/               # registry, middleware, handlers, templates
  database/session-db.js
  tools/executor.js
  utils/
  archive/                # old server mode (do not use)
tests/                    # jest + manual scripts
docs/                     # current docs
docs/history/             # archived / stale writeups
ecosystem.config.cjs      # PM2
```

## Scripts

```bash
npm start
npm run dev
npm test
npm run lint
npm run test:commands
```

## Security

- Set `ALLOWED_WHATSAPP_NUMBERS` (or DB whitelist). Empty env whitelist = allow all (dev only).
- Unauthorized senders are dropped silently.
- File tools sandboxed to project path.
- **Bash tool is not a full sandbox** — only runs with `cwd` = project. Trusted operators only.
- Never commit real API keys. Rotate anything that appeared in old examples.

## Docs

| File | Content |
|------|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Current design |
| [docs/SETUP.md](docs/SETUP.md) | Install, env, PM2 |
| [docs/COMMANDS.md](docs/COMMANDS.md) | Commands |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Done / next |
| [docs/history/](docs/history/) | Historical notes only |
| [CLAUDE.md](CLAUDE.md) | Agent-oriented map |

## License

MIT
