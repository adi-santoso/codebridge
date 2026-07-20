# Historical docs

These files describe **past** designs, early validation, or phase completion notes. They are **not** the current architecture.

## Prefer instead

| Need | Current doc |
|------|-------------|
| Overview | `README.md` |
| Agent map | `CLAUDE.md` |
| Architecture | `docs/ARCHITECTURE.md` |
| Setup | `docs/SETUP.md` |
| Commands | `docs/COMMANDS.md` |
| Roadmap | `docs/ROADMAP.md` |

## What’s in here

| File | Why historical |
|------|----------------|
| `ANALYSIS.md` | Claimed zero implementation; obsolete |
| `TECHNICAL_SUMMARY.md` | MCP-server-first design; replaced by direct spawner + gateway client |
| `GETTING_STARTED.md` | Pre-implementation structure |
| `CRITICAL_FINDINGS.md` | Early “CLI cannot spawn” blocker; later solved via stream-json DirectClaudeSpawner |
| `VALIDATION_SUCCESS.md` | Point-in-time validation note |
| `PHASE7_*` (root copies) | Completion banners; detail remains under `docs/` |
| `README-CLIENT.md` | Partial client-mode note; folded into main README |

Phase implementation summaries under `docs/COMMAND_SYSTEM_PHASE*.md` and `docs/PHASE*_*.md` remain next to active docs for command-system archaeology; treat as **append-only history**, not onboarding.

## Archive siblings

Also see `docs/archive/` for gateway-protocol revision notes from the server→client flip.
