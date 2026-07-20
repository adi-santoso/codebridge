# CodeBridge — Architecture (current)

**Last updated:** 2026-03  
**Source of truth:** `src/` (this doc tracks the running design)

Older MCP-server-centric designs are archived under `docs/history/` and `docs/archive/`.

---

## 1. Goals

- Code via WhatsApp using Claude Code CLI capabilities
- Multi-session per user, project-scoped workspaces
- External WhatsApp gateway (CodeBridge does not run Baileys)
- Slash-command control plane + free-text coding prompts

## 2. Non-goals

- Replace IDE / Claude Desktop UI
- Official WhatsApp Business API (gateway may change independently)
- Perfect multi-tenant isolation for untrusted public users (Bash is trusted-user level)

---

## 3. High-level diagram

```
┌──────────────────────┐
│   WhatsApp users     │
└──────────┬───────────┘
           │
┌──────────▼───────────┐
│ External WA Gateway  │  Baileys, QR, multi-session WA
│ Socket.IO server     │  e.g. https://chat.gatrion.my.id
└──────────┬───────────┘
           │ whatsapp:message
           │ codebridge:response
┌──────────▼───────────┐
│ CodeBridge process   │  src/main.js
│  GatewayClient       │
│  MessageHandler      │
│  Command system      │
│  SessionManager      │
│  DirectClaudeSpawner │
│  ToolExecutor        │
│  SessionDatabase     │
└──────────┬───────────┘
           │ spawn + stream-json
┌──────────▼───────────┐
│ Claude Code CLI      │  per session subprocess
└──────────────────────┘
```

---

## 4. Runtime components

### 4.1 GatewayClient (`src/gateway-client.js`)

- Socket.IO **client** with auth `{ key, clientType: 'codebridge' }`
- Auto-reconnect; re-joins rooms after reconnect
- Events:
  - **In:** `whatsapp:message` → `{ from, message, sessionId, timestamp }`
  - **Out:** `codebridge:response` → `{ sessionId, to, message, timestamp }`
  - Rooms: join/leave by gateway `sessionId`

### 4.2 SessionRoomManager

Maps CodeBridge sessions ↔ gateway rooms so replies route to the right WA session.

### 4.3 MessageHandler (`src/whatsapp/message-handler.js`)

1. Whitelist check (`ALLOWED_WHATSAPP_NUMBERS` / DB mode)
2. If starts with `/` → `CommandHandler`
3. Else → `SessionManager` prompt path
4. Aggregates async `response-ready` / errors / timeouts
5. Chunks long text (~4000 chars) for WhatsApp limits

### 4.4 SessionManager (`src/claude/session-manager.js`)

- Multi-session per `userId` (phone)
- State: `NO_SESSION` | `SESSION_SELECTED` | `PROJECT_SELECTED`
- Holds `DirectClaudeSpawner` + `ToolExecutor` per session
- Buffers stream text until turn-end
- Restores eligible sessions from SQLite on boot
- Emits events consumed by main / message handler

### 4.5 DirectClaudeSpawner (`src/claude/direct-spawner.js`)

- Locates `claude` on PATH (with OS fallbacks)
- Loads `~/.claude/settings.json` env (token, base URL, model)
- Spawns CLI with stream-json protocol
- Response modes: brief / balanced / detailed / code-only / explain-only

### 4.6 ClaudeStreamHandler (`src/claude/stream-handler.js`)

- Parses NDJSON stdout
- Emits structured events: text, tool-use, turn-end, errors, etc.

### 4.7 ToolExecutor (`src/tools/executor.js`)

| Tool | Sandbox |
|------|---------|
| Read / Write / Edit | Path must stay under `projectPath` |
| Bash | `cwd` = project only — **not** a full jail |

Timeout default 30s; maxBuffer 10MB.

### 4.8 Command system (`src/commands/`)

```
message → Parser → Middleware chain → Registry lookup → Handler
```

- `registry.js` — metadata, aliases, roles, rate limits (~45 commands)
- `middleware.js` — auth, role (user/admin/superadmin), rate limit, history
- `handlers/*` — domain handlers
- `templates/*` — `/ask` `/fix` `/review` `/test` `/doc` `/refactor`

### 4.9 SessionDatabase (`src/database/session-db.js`)

SQLite WAL. Tables include:

- `sessions`
- `command_history`
- `user_preferences`
- `saved_sessions`
- `tool_audit`
- `session_context`
- `admin_users`, `whitelist`, `audit_log` (admin phase)

Default path: `.codebridge/sessions.db`

---

## 5. Message flows

### 5.1 Coding prompt

```
WA → Gateway → GatewayClient
  → MessageHandler.handleMessage
  → SessionManager (active session, PROJECT_SELECTED)
  → spawner.sendPrompt
  → stream events → buffer
  → turn-end → response-ready / async-response
  → GatewayClient.sendResponse (chunked if needed)
  → WA
```

### 5.2 Slash command

```
WA → ... → MessageHandler
  → CommandHandler (middleware)
  → handler function
  → immediate response string
  → GatewayClient.sendResponse
```

### 5.3 Tool use

```
Claude stream tool_use
  → SessionManager → ToolExecutor.execute
  → result written back into Claude session
  → Claude continues turn
```

---

## 6. Configuration surfaces

| Surface | Role |
|---------|------|
| `.env` | Gateway, whitelist, limits, feature flags |
| `~/.claude/settings.json` | CLI auth / endpoint / model |
| `config/projects.json` | Optional static project list (registry may also scan root) |
| `ecosystem.config.cjs` | PM2 process env (PATH/HOME for deploy user) |

---

## 7. Security model

1. **Ingress:** phone whitelist (env and/or DB)
2. **Authz:** command `requiredRole` (user < admin < superadmin)
3. **Rate limit:** per-command and global-ish command windows
4. **FS:** path validation for file tools
5. **Bash:** trusted operator assumption — harden before multi-tenant public use
6. **Audit:** tool_audit + admin audit_log tables

---

## 8. Failure handling

| Failure | Behavior |
|---------|----------|
| Gateway disconnect | Socket.IO reconnect + rejoin rooms |
| Claude hang / long job | Request timeout notify; late response may still deliver |
| Tool error | Returned as tool result / user-facing error |
| Unauthorized number | Silent drop |
| Process SIGINT/SIGTERM | Graceful: stop handler → rooms → gateway → sessions |

---

## 9. Deployment shape

- Single Node process (no cluster — subprocess map is in-memory)
- PM2 fork mode, `max_memory_restart` ~1G
- External gateway HA is out of scope of this repo

---

## 10. Abandoned approaches (do not revive by accident)

| Approach | Where | Why left |
|----------|--------|----------|
| CodeBridge as Socket.IO **server** | `src/archive/` | Flipped to client-of-gateway |
| ACP / JSON-RPC agent protocol | `src/claude/archive/` | Direct CLI stream-json worked |
| MCP server as primary control plane | early docs | Replaced by direct spawner + tools |

---

## 11. Related docs

- Setup: `docs/SETUP.md`
- Commands: `docs/COMMANDS.md`
- Roadmap: `docs/ROADMAP.md`
- Agent map: `CLAUDE.md`
- History: `docs/history/`
