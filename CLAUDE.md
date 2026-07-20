# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

## Project Overview

**CodeBridge** bridges WhatsApp chat to Claude Code CLI so a developer can code via WhatsApp.

- Entry: `src/main.js`
- Runtime: Node.js ≥18, ESM (`"type": "module"`)
- Role: **Socket.IO client** to an external WhatsApp Gateway (not a Baileys host)
- Engine: spawn **Claude CLI** per session (`stream-json`), parse with `ClaudeStreamHandler`
- Persistence: SQLite (`better-sqlite3`) at `.codebridge/sessions.db`

**Status (2026-03):** Implemented and usable. Core path + 45-command system (Phases 1–9) complete. Not a design-only repo.

## Architecture (current)

```
WhatsApp user
    → External Gateway (Baileys + Socket.IO server)
    → GatewayClient (src/gateway-client.js)
    → MessageHandler (src/whatsapp/message-handler.js)
         ├─ /command → CommandHandler + registry + middleware
         └─ prompt   → SessionManager → DirectClaudeSpawner
                          → Claude CLI subprocess (stream-json)
                          → ClaudeStreamHandler events
                          → ToolExecutor (Bash/Read/Write/Edit)
    → codebridge:response → Gateway → WhatsApp
```

**Do not implement** the old MCP-server-as-core design. That was abandoned. MCP packages in `package.json` / `src/claude/archive/` are historical.

### Session state machine

`NO_SESSION` → `SESSION_SELECTED` → `PROJECT_SELECTED`

Coding prompts require `PROJECT_SELECTED` (session + project chosen).

### Key modules

| Path | Role |
|------|------|
| `src/main.js` | Boot, gateway hooks, periodic cleanup, shutdown |
| `src/gateway-client.js` | Socket.IO client, rooms, send response |
| `src/session-room-manager.js` | Join/leave gateway rooms per session |
| `src/whatsapp/message-handler.js` | Whitelist, command vs prompt, chunking, timeouts |
| `src/claude/session-manager.js` | Multi-session, spawners, response buffer |
| `src/claude/direct-spawner.js` | Spawn Claude CLI, settings.json, response modes |
| `src/claude/stream-handler.js` | NDJSON stream-json parser |
| `src/tools/executor.js` | Tool execution (path sandbox for Read/Write/Edit) |
| `src/commands/*` | Parser, registry, middleware, handlers, templates |
| `src/database/session-db.js` | SQLite schema + queries |
| `src/utils/*` | logger, config, project-registry, ignore-matcher, file-ops |

Archive (do not extend unless reviving deliberately):

- `src/archive/` — old Socket.IO **server** mode
- `src/claude/archive/` — ACP / JSON-RPC experiments

## Commands

```bash
npm start          # node src/main.js
npm run dev        # watch mode
npm test           # jest (experimental-vm-modules)
npm run lint       # eslint src/
npm run test:commands
pm2 start ecosystem.config.cjs
pm2 logs codebridge
```

Manual integration scripts live under `tests/` (many are runnable with `node tests/...`, not only Jest).

## Configuration

Copy `.env.example` → `.env`. Critical vars:

| Var | Purpose |
|-----|---------|
| `GATEWAY_URL` | External gateway Socket.IO URL |
| `GATEWAY_AUTH_KEY` | Client auth key |
| `GATEWAY_SESSIONS` | Optional comma-separated gateway room IDs to join on boot |
| `PROJECT_ROOT_PATH` | Root used by ProjectRegistry |
| `SESSION_DB_PATH` | SQLite path (default `./.codebridge/sessions.db`) |
| `ALLOWED_WHATSAPP_NUMBERS` | Comma-separated whitelist (empty = allow all — insecure) |
| `MAX_CONCURRENT_SESSIONS` | Cap concurrent Claude sessions |
| `ANTHROPIC_*` / Claude model | Often also via `~/.claude/settings.json` for CLI |

Claude CLI must be on `PATH`. Spawner loads `~/.claude/settings.json` for auth/endpoint/model (kreova-compatible endpoints supported).

## Command system

- Slash messages → `CommandParser` → `CommandHandler` (middleware: auth, role, rate limit, logging)
- Registry: `src/commands/registry.js` (~45 commands)
- Handlers: `src/commands/handlers/{basic,session,tool,file,debug,response,context,template,admin}.js`
- Templates: `src/commands/templates/`
- Full user list: `docs/COMMANDS.md`

Non-slash text = coding prompt to active Claude session.

## Security (known constraints)

- Whitelist via env and/or DB (`WHITELIST_MODE`)
- Unauthorized numbers: silent drop (no reply)
- Read/Write/Edit: path must stay under project root
- **Bash is only cwd-sandboxed** — not a full jail; treat as trusted-user tool
- Prefer deny-by-default whitelist in production

## Docs map

| Doc | Use |
|-----|-----|
| `README.md` | Human quick start + status |
| `docs/ARCHITECTURE.md` | Current architecture |
| `docs/SETUP.md` | Install / env / PM2 |
| `docs/COMMANDS.md` | Command reference |
| `docs/ROADMAP.md` | Done vs next |
| `docs/history/` | Stale design notes & phase writeups (historical only) |
| `docs/COMMAND_SYSTEM_PHASE*.md` | Phase design detail (command system) |

When docs disagree with code, **trust the code**.

## Implementation notes for agents

1. Read existing module before editing; match ESM + existing Logger patterns.
2. Prefer shortest diff; no new deps if stdlib/existing dep works.
3. Session DB methods live in `session-db.js` — check schema before adding tables.
4. Gateway protocol:
   - In: `whatsapp:message` `{ from, message, sessionId, timestamp }`
   - Out: `codebridge:response` `{ sessionId, to, message, timestamp }`
5. Long WhatsApp replies are chunked (~4000 chars) in MessageHandler / main hooks.
6. Do not reintroduce Socket.IO **server** mode in `main.js` unless explicitly requested.
