# Command System Phase 7: Context Management

Advanced context control for power users.

## Overview

Phase 7 introduces powerful context management features that give you fine-grained control over:

1. **Working Directory** - Set the working directory within your project for relative path operations
2. **Additional Context** - Pin files to be included in all queries to Claude
3. **Ignore Patterns** - Exclude files/directories from operations using .gitignore-style patterns

## Commands

### `/focus [path]` - Set Working Directory

Set the current working directory within your project. All file operations (`/ls`, `/cat`, `/tree`, etc.) will be relative to this directory.

**Usage:**
```
/focus                    # Show current working directory
/focus src/components     # Set working directory to src/components
/focus .                  # Reset to project root
```

**Examples:**

Focus on frontend code:
```
/focus src/frontend
/ls                      # Lists files in src/frontend
/cat App.js             # Reads src/frontend/App.js
```

Reset to root:
```
/focus .
```

**Security:**
- Working directory must be within your project
- Cannot navigate outside project root
- Directory must exist

---

### `/context add <file>` - Add File to Context

Add a file to additional context. This file will be automatically included in all queries to Claude, providing persistent context without needing to mention it repeatedly.

**Usage:**
```
/context add <file>       # Add file to context
/context list             # Show all context files
/context clear            # Remove all context files
```

**Examples:**

Add configuration file:
```
/context add src/config.js
```
Now Claude will always have access to your config in every query.

Add API documentation:
```
/context add docs/API.md
```

List context files:
```
/context list
```

Clear all context:
```
/context clear
```

**Limits:**
- Max 10 files (configurable via `CONTEXT_MAX_FILES`)
- Max 100KB per file (configurable via `CONTEXT_MAX_FILE_SIZE`)
- Max 1MB total context size (configurable via `CONTEXT_MAX_TOTAL_SIZE`)

**Use Cases:**
- Keep important config files always available
- Include API documentation for every query
- Pin architectural diagrams or specs
- Remember project conventions and style guides

---

### `/ignore <pattern>` - Add Ignore Pattern

Add patterns to exclude files/directories from operations. Uses .gitignore-style syntax.

**Usage:**
```
/ignore <pattern>         # Add ignore pattern
/ignore list              # Show all patterns
/ignore clear             # Remove all user patterns
```

**Pattern Syntax:**

| Pattern | Description | Example |
|---------|-------------|---------|
| `*.log` | Wildcard | Ignores all .log files |
| `node_modules/` | Directory | Ignores directory and its contents |
| `**/dist` | Recursive | Ignores dist anywhere in tree |
| `!important.log` | Negation | Don't ignore (override) |
| `#comment` | Comment | Ignored by parser |

**Examples:**

Ignore log files:
```
/ignore *.log
```

Ignore build output:
```
/ignore dist/
/ignore build/
```

Ignore deeply nested directories:
```
/ignore **/node_modules
/ignore **/.next
```

Don't ignore specific file (negation):
```
/ignore !important-debug.log
```

List all patterns:
```
/ignore list
```

Clear user patterns:
```
/ignore clear
```

**Default Patterns:**

By default, these patterns are always ignored:
- `node_modules`
- `dist`
- `.git`

You can configure defaults via `IGNORE_DEFAULT_PATTERNS` in `.env`.

---

## Workflows

### Workflow 1: Focus on Specific Module

When working on a specific module, focus on its directory and pin relevant files:

```
# Focus on authentication module
/focus src/auth

# Add context files
/context add ../config/auth.config.js
/context add ../docs/AUTH.md

# Now work within this context
/ls
/cat login.js
/tree
```

All operations are relative to `src/auth/`, and auth config/docs are available in every query.

### Workflow 2: Clean Up Search Results

When searching or listing files, ignore build artifacts and dependencies:

```
# Ignore common noise
/ignore node_modules/
/ignore dist/
/ignore .next/
/ignore *.map
/ignore *.min.js

# Now searches are clean
/search TODO
/tree
```

### Workflow 3: Multi-file Context

Working on a feature that spans multiple files? Pin them all:

```
# Pin all related files
/context add src/components/Button.jsx
/context add src/styles/button.css
/context add tests/button.test.js
/context add docs/BUTTON_SPEC.md

# Now every query has full context
"Refactor the Button component to use CSS modules"
```

Claude will see all 4 files automatically.

### Workflow 4: Temporary Focus

Need to quickly check something in a different directory?

```
# Save current focus
/focus                   # Note: src/components

# Temporarily switch
/focus tests/unit
/ls
/cat auth.test.js

# Return to previous focus
/focus ../components
```

---

## Performance Considerations

### Context File Size

Large context files slow down responses:

- **Small (<10KB)**: No noticeable impact
- **Medium (10-50KB)**: Slight delay
- **Large (50-100KB)**: Noticeable delay
- **Very Large (>100KB)**: Rejected (over limit)

**Tip:** Only add files you reference frequently. Remove them when done.

### Number of Context Files

Each context file adds to the prompt sent to Claude:

- **1-3 files**: Minimal impact
- **4-7 files**: Moderate impact
- **8-10 files**: Significant impact on response time

**Tip:** Use `/context clear` after completing a feature to reset.

### Ignore Patterns

Ignore patterns are fast - they're evaluated locally before sending to Claude. Use them liberally to:

- Speed up `/search` operations
- Reduce noise in `/tree` output
- Keep `/ls` results clean

---

## Persistence

Context and ignore patterns are **persistent** across sessions (if `CONTEXT_PERSIST_TO_DB=true`):

- Working directory: Saved per session
- Context files: Saved per session
- Ignore patterns: Saved per session

When you restore a session with `/load`, all context is restored.

---

## Limitations

1. **Context files are read-only**: They provide reference, but modifications require explicit commands
2. **No directory context**: Can only add files, not entire directories
3. **Working directory affects file commands only**: Doesn't affect `/context add` or `/ignore` (those are always project-relative)
4. **Ignore patterns don't affect context files**: Context files are always included, even if they match ignore patterns

---

## Configuration

Edit `.env` to customize limits:

```bash
# Context Management (Phase 7)
CONTEXT_MAX_FILES=10                 # Max files in additional context
CONTEXT_MAX_FILE_SIZE=102400         # Max 100KB per context file
CONTEXT_MAX_TOTAL_SIZE=1048576       # Max 1MB total context
CONTEXT_PERSIST_TO_DB=true           # Save context to database
IGNORE_DEFAULT_PATTERNS=node_modules,dist,.git  # Default patterns
```

---

## FAQ

**Q: What happens if a context file is modified externally?**

A: Context files are read when added. If the file changes on disk, use `/context clear` and `/context add` again to refresh.

**Q: Can I add files outside my project?**

A: No. For security, all paths must be within your project directory.

**Q: Do ignore patterns affect `/cat` and `/tree`?**

A: Yes, for `/tree` and `/search`. No, for `/cat` (you can explicitly read ignored files).

**Q: Can I use multiple ignore patterns at once?**

A: Yes! Add them one by one:
```
/ignore *.log
/ignore *.tmp
/ignore build/
```

**Q: What's the difference between working directory and context files?**

A: Working directory changes where relative paths resolve. Context files add file contents to every Claude query.

---

## Examples

### Example 1: Focused Development

```
# Start session
/newsession
/project myapp

# Focus on API layer
/focus src/api

# Add API schema as context
/context add ../schemas/api.schema.json

# Ignore generated files
/ignore *.generated.ts

# Now work efficiently
/ls
/cat users.ts
"Add pagination to the users endpoint"
```

### Example 2: Documentation Writing

```
# Focus on docs
/focus docs

# Add examples as context
/context add ../examples/quickstart.js
/context add ../examples/advanced.js

# Ignore drafts
/ignore drafts/

# Write docs
"Update the quickstart guide with the new API"
```

### Example 3: Bug Investigation

```
# Add relevant files
/context add src/auth/login.js
/context add src/middleware/auth.js
/context add logs/error.log

# List context
/context list

# Investigate
"Why are users getting authentication errors?"

# Clean up after fixing
/context clear
```

---

## Summary

Phase 7 context management gives you precise control over:

- **Where** you're working (`/focus`)
- **What** Claude sees (`/context`)
- **What** to exclude (`/ignore`)

Use these tools to create an efficient, focused development workflow tailored to your project structure.

---

**Next:** Phase 8: Snippets & Templates (Coming soon)
