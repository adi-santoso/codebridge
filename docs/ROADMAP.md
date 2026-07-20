# CodeBridge — Roadmap

**Last updated:** 2026-03

This replaces the old “Phase 1 not started” roadmap. Implementation of the core bridge and command system is done.

---

## Done

### Core bridge

- [x] DirectClaudeSpawner (Claude CLI + stream-json)
- [x] ClaudeStreamHandler (NDJSON parse)
- [x] SessionManager multi-session + state machine
- [x] SQLite persistence (`session-db.js`)
- [x] ToolExecutor (Bash / Read / Write / Edit)
- [x] Gateway **client** mode (Socket.IO)
- [x] Session room join/leave
- [x] MessageHandler routing (command vs prompt)
- [x] Response aggregation + WhatsApp chunking
- [x] Whitelist + silent drop unauthorized
- [x] Request timeout + late delivery path
- [x] PM2 ecosystem config
- [x] Graceful shutdown

### Command system (9 phases)

| Phase | Focus | Status |
|-------|--------|--------|
| 1 | Foundation: parser, registry, middleware, basic cmds | ✅ |
| 2 | Session save/load/history | ✅ |
| 3 | Tool control | ✅ |
| 4 | File ops + response modes | ✅ |
| 5 | WhatsApp/gateway integration (core product path) | ✅ |
| 6 | Debug / metrics | ✅ |
| 7 | Context / focus / ignore | ✅ |
| 8 | Templates | ✅ |
| 9 | Admin RBAC / whitelist DB / audit | ✅ |

Detail writeups: `docs/COMMAND_SYSTEM_PHASE*.md`, `docs/PHASE*_IMPLEMENTATION_SUMMARY.md`.

### Abandoned (documented, not on path)

- CodeBridge as Socket.IO **server** (archived under `src/archive/`)
- ACP agent protocol as primary (archived under `src/claude/archive/`)
- MCP server as the main control plane (early design only)

---

## Next (recommended)

### P0 — Safety & truth

- [ ] Harden Bash tool (block path escape / dangerous patterns or restricted shell)
- [ ] Default-deny when whitelist empty
- [ ] Secret hygiene (no real keys in examples; rotate if leaked)
- [x] Docs aligned with code (this pass)

### P1 — Ops

- [ ] Idle session killer + hard concurrent spawn enforcement audit
- [ ] Health endpoint or `/metrics` export for process monitoring
- [ ] Backup/rotate `sessions.db`
- [ ] CI: lint + unit tests on PR

### P2 — Product

- [ ] Broader Claude tool surface if CLI emits more tool names
- [ ] Token/cost tracking (`METRICS_INCLUDE_TOKEN_USAGE`)
- [ ] Pagination for `/history` and long lists
- [ ] Slim or archive noisy phase docs into `docs/history/`

### P3 — Scale (only if multi-user real)

- [ ] Stronger multi-tenant isolation
- [ ] Horizontal split (gateway already external; session store shared)
- [ ] Redis or external session coordination

---

## Effort guide (next work)

| Item | Effort | Risk if skipped |
|------|--------|-----------------|
| Bash sandbox | 1–2 days | High (RCE-ish within host user) |
| Default-deny whitelist | hours | High on public gateway |
| Idle cleanup audit | 0.5–1 day | Medium (RAM) |
| CI basics | 0.5 day | Medium (regressions) |
| Token metrics | 1–2 days | Low |

---

## Doc maintenance rule

If code and docs disagree, fix the docs or mark them historical under `docs/history/`. Do not leave root files claiming “implementation not started.”
