# CodeBridge — Commands Reference

Commands start with `/`. Send via WhatsApp to the bot number handled by your gateway.

Non-slash messages are coding prompts (require session + project selected).

Source of truth for registration: `src/commands/registry.js`.

---

## Quick start

```
/newsession
/projects
/project <name>
<your coding request>
/status
/help
```

---

## General

| Command | Usage | Description |
|---------|-------|-------------|
| `/help` | `/help [command]` | List commands or detail one |
| `/ping` | `/ping` | Liveness / latency |
| `/version` | `/version` | Version & environment |
| `/status` | `/status` | Session status & stats |

Aliases: `help`→`h`,`?` · `ping`→`heartbeat` · `version`→`v`,`ver` · `status`→`info`

---

## Session

| Command | Usage | Description |
|---------|-------|-------------|
| `/newsession` | `/newsession` | Create session |
| `/sessions` | `/sessions` | List your sessions |
| `/session` | `/session <sessionId>` | Switch active session |
| `/closesession` | `/closesession` | Close current session |
| `/reset` | `/reset` | Clear conversation / start fresh |
| `/history` | `/history [n]` | Recent command/history items |
| `/save` | `/save <name>` | Snapshot session |
| `/load` | `/load [name]` | Restore snapshot |
| `/delete` | `/delete <name>` | Delete saved snapshot |

Aliases: `newsession`→`new`,`create` · `sessions`→`listses`

---

## Project

| Command | Usage | Description |
|---------|-------|-------------|
| `/projects` | `/projects` | List available projects |
| `/project` | `/project <name>` | Select project for current session |

After `/project`, state becomes `PROJECT_SELECTED` and Claude can be used for prompts.

---

## Tools

| Command | Usage | Description |
|---------|-------|-------------|
| `/tools` | `/tools [category]` | List tools + status |
| `/allow` | `/allow <tool>` | Enable tool |
| `/deny` | `/deny <tool>` | Disable tool |
| `/cancel` | `/cancel` | Stop current tool run |
| `/retry` | `/retry [--force]` | Retry last failed tool |
| `/toollog` | `/toollog [n]` | Tool execution history |

Claude-driven tools (when allowed): Bash, Read, Write, Edit.

---

## Files

| Command | Usage | Description |
|---------|-------|-------------|
| `/ls` | `/ls [path]` | List directory |
| `/cat` | `/cat <file>` | Read file |
| `/tree` | `/tree [path] [--depth=N]` | Directory tree |
| `/search` | `/search <pattern> [path] [--file=*.ext] [--i] [--limit=N]` | Search files |
| `/diff` | `/diff [path]` | Git diff |

Paths are project-scoped. Ignore patterns from `/ignore` affect listing/search.

---

## Response style

| Command | Description |
|---------|-------------|
| `/brief` | Concise answers |
| `/balanced` | Default balance |
| `/detailed` | Verbose / thorough |
| `/code-only` | Prefer code output only |
| `/explain-only` | Prefer explanation without code |

Stored in user preferences; applied via spawner system-prompt modifiers.

---

## Context

| Command | Usage | Description |
|---------|-------|-------------|
| `/focus` | `/focus [path]` | Working directory inside project |
| `/context` | `/context <add\|list\|clear> [file]` | Extra files pinned into context |
| `/ignore` | `/ignore <pattern\|list\|clear>` | gitignore-style ignore patterns |

Limits (defaults): max context files / size via env (`CONTEXT_*`).

---

## Templates

| Command | Usage | Description |
|---------|-------|-------------|
| `/ask` | `/ask <question>` | Short Q&A |
| `/fix` | `/fix <error message>` | Fix-oriented prompt |
| `/review` | `/review <file>` | Code review |
| `/test` | `/test <file>` | Generate tests |
| `/doc` | `/doc <file>` | Generate docs |
| `/refactor` | `/refactor <file>` | Refactor suggestions |

---

## Debug

| Command | Usage | Description |
|---------|-------|-------------|
| `/debug` | `/debug <on\|off>` | Toggle debug mode |
| `/errors` | `/errors [n]` | Recent errors |
| `/logs` | `/logs [n]` | Debug logs (needs debug on) |
| `/metrics` | `/metrics` | Session metrics |

---

## Admin

Requires admin / superadmin role (`ADMIN_ENABLED`, `SUPERADMIN_INITIAL`, DB roles).

| Command | Usage | Description |
|---------|-------|-------------|
| `/admin` | `/admin <subcommand> [args]` | Multi-user & system admin |

Subcommands (see `/help admin` or `docs/COMMAND_SYSTEM_PHASE9.md`): whitelist, roles, audit, system stats, etc.

Roles: `user` < `admin` < `superadmin`.

---

## Middleware behavior

All registered commands pass through:

1. Parse (`/name args`)
2. Auth / whitelist
3. Role check
4. Rate limit (per-command config)
5. Handler
6. Optional history log

---

## Notes

- WhatsApp message length ~4k — long replies are auto-chunked
- Coding prompts are async; you may get ack then full answer
- Timeout messages do not always mean Claude stopped; late replies can still arrive
