# CodeBridge — Setup

## Prerequisites

- Node.js 18+
- npm
- Claude Code CLI installed and on `PATH`
- Running WhatsApp Gateway with Socket.IO (external project)
- (Production) PM2 optional

## 1. Install

```bash
cd codebridge
npm install
```

Native module: `better-sqlite3` must compile for your platform.

## 2. Environment

```bash
cp .env.example .env
```

### Required / important

```env
# Gateway
GATEWAY_URL=https://chat.gatrion.my.id
GATEWAY_AUTH_KEY=change-me
GATEWAY_SESSIONS=                 # optional: room ids to join on boot, comma-separated

# Projects & sessions
PROJECT_ROOT_PATH=D:/working/gatrion
SESSION_DB_PATH=./.codebridge/sessions.db
MAX_CONCURRENT_SESSIONS=10
MAX_HISTORY_LENGTH=20

# Security
ALLOWED_WHATSAPP_NUMBERS=628xxxxxxxxxx
WHITELIST_MODE=both               # env | database | both
SUPERADMIN_INITIAL=628xxxxxxxxxx
ADMIN_ENABLED=true

# Claude / model (optional if fully set in ~/.claude/settings.json)
ANTHROPIC_API_KEY=
ANTHROPIC_BASE_URL=http://127.0.0.1:3847/
CLAUDE_MODEL=

# Ops
LOG_LEVEL=info
DEBUG=false
```

Do **not** commit real keys. If an example ever contained a real token, rotate it.

### Claude CLI settings

Often used path: `~/.claude/settings.json`

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "your-token",
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:3847",
    "ANTHROPIC_MODEL": "your-model-id"
  }
}
```

Verify CLI:

```bash
claude --version
# interactive smoke test in a project directory
```

## 3. Projects

CodeBridge resolves projects from `PROJECT_ROOT_PATH` / `PROJECT_PATHS` via `ProjectRegistry`, and/or `config/projects.json` depending on config.

Ensure target project directories exist and Claude may read/write them.

## 4. Run

### Dev

```bash
npm run dev
```

### Prod (foreground)

```bash
npm start
```

### Prod (PM2)

```bash
pm2 start ecosystem.config.cjs
pm2 logs codebridge
pm2 restart codebridge
```

Edit `ecosystem.config.cjs` `cwd`, `HOME`, `PATH` for the deploy user so `claude` is found.

## 5. First WhatsApp flow

1. Ensure gateway session is up and CodeBridge joined the room (`GATEWAY_SESSIONS` or runtime join)
2. From a whitelisted number:

```
/ping
/newsession
/projects
/project <name>
hello — list files in this project
/status
```

## 6. Tests

```bash
npm test
npm run test:commands
node tests/phase5-integration.test.js
node tests/test-basic-prompt.js
```

Many files under `tests/` are manual scripts; run with `node` directly.

## 7. Data locations

| Path | Content |
|------|---------|
| `.codebridge/sessions.db` | Sessions, prefs, audit, whitelist |
| `logs/` | App / PM2 logs (if configured) |

Back up `sessions.db` if you care about saved sessions / admin state.

## 8. Troubleshooting

### Cannot connect to gateway

- Check `GATEWAY_URL`, TLS, firewall
- Check `GATEWAY_AUTH_KEY` matches gateway config
- Confirm gateway accepts `clientType: codebridge`

### Claude spawn fails

- `which claude` / `where claude`
- PM2: ensure `PATH` and `HOME` point at user that has CLI + `~/.claude`
- Read spawner debug logs (`DEBUG=true`)

### No reply on WhatsApp

- Number on whitelist?
- Gateway room joined?
- Session in `PROJECT_SELECTED` for coding prompts?
- Check `logs/` and gateway logs

### `better-sqlite3` build errors

Install build tools for your OS; reinstall deps.

## 9. Security checklist

- [ ] Non-empty whitelist
- [ ] Strong `GATEWAY_AUTH_KEY`
- [ ] No secrets in git
- [ ] `PROJECT_ROOT_PATH` only contains intended repos
- [ ] Understand Bash tool is not a full sandbox
- [ ] Superadmin phone set intentionally
