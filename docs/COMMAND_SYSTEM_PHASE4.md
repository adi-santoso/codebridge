# File Operations Commands - Phase 4

This document describes the file operation commands available in CodeBridge for interacting with project files via WhatsApp.

## Overview

Phase 4 introduces five file operation commands that allow you to explore and read files in your project without leaving WhatsApp:

- `/ls` - List directory contents
- `/cat` - Read file content
- `/tree` - Show directory tree structure
- `/search` - Search for patterns in files
- `/diff` - Show git diff

## Prerequisites

All file operation commands require:
1. An active session (`/newsession`)
2. A selected project (`/project <name>`)

## Commands

### `/ls` - List Directory Contents

List files and directories in a path.

**Usage:**
```
/ls [path]
```

**Examples:**
```
/ls                    # List current directory
/ls src/               # List src directory
/ls src/commands       # List specific subdirectory
```

**Aliases:** `/dir`, `/list`

**Output:**
- Directories shown with 📁 icon
- Files shown with 📄 icon and size
- Hidden files (starting with `.`) are not shown
- Directories listed first, then files (both alphabetically sorted)

**Limitations:**
- Maximum 100 items displayed per directory
- Hidden files/directories not shown

---

### `/cat` - Read File Content

Read and display the contents of a file.

**Usage:**
```
/cat <file>
```

**Examples:**
```
/cat package.json
/cat src/index.js
/cat README.md
```

**Aliases:** `/read`, `/view`

**Features:**
- Syntax highlighting based on file extension
- Automatic truncation for large files (max 1MB by default)
- Shows file size and truncation status

**Supported File Types:**
- JavaScript/TypeScript (`.js`, `.jsx`, `.ts`, `.tsx`)
- Python (`.py`)
- Java (`.java`)
- C/C++ (`.c`, `.cpp`, `.h`)
- Go (`.go`)
- Rust (`.rs`)
- HTML/CSS (`.html`, `.css`, `.scss`)
- JSON/YAML (`.json`, `.yaml`, `.yml`)
- Markdown (`.md`)
- Shell scripts (`.sh`, `.bash`)
- And more...

**Limitations:**
- Files larger than 1MB are truncated (configurable)
- Binary files may not display correctly
- Very long lines may be truncated for WhatsApp compatibility

---

### `/tree` - Show Directory Tree

Display a visual tree structure of directories and files.

**Usage:**
```
/tree [path] [--depth=N]
```

**Examples:**
```
/tree                  # Show tree from root
/tree src/             # Show tree from src/
/tree --depth=3        # Show tree with max depth 3
/tree src/ --depth=2   # Combine path and depth
```

**Aliases:** `/dirtree`

**Features:**
- Visual tree structure with box-drawing characters
- Shows file sizes
- Counts total directories and files
- Respects depth limit

**Options:**
- `--depth=N` - Maximum depth to traverse (default: 5, max: 10)

**Output Format:**
```
🌲 Directory Tree: /

3 directories, 5 files
Max depth: 5

├── 📁 src/
│   ├── 📄 index.js (2.3 KB)
│   └── 📁 utils/
│       ├── 📄 helper.js (1.1 KB)
│       └── 📄 logger.js (3.4 KB)
├── 📄 package.json (845 B)
└── 📄 README.md (1.2 KB)
```

**Limitations:**
- Hidden files/directories not shown
- Large directory structures may be truncated for WhatsApp
- Maximum depth of 10 levels

---

### `/search` - Search in Files

Search for a text pattern across all files in the project (grep-like).

**Usage:**
```
/search <pattern> [path] [options]
```

**Options:**
- `--file=<pattern>` - Filter by file pattern (e.g., `*.js`)
- `--i` - Case-sensitive search (default is case-insensitive)
- `--limit=N` - Maximum results to return (default: 50, max: 50)

**Examples:**
```
/search "function"                    # Search for "function" in all files
/search "import" src/                 # Search in src/ directory
/search --file="*.js" "TODO"          # Search only in .js files
/search --limit=20 "error"            # Limit to 20 results
/search --i "ERROR"                   # Case-sensitive search
```

**Aliases:** `/grep`, `/find`

**Output Format:**
```
🔍 Search Results

Pattern: "TODO"
Path: src/
Files: *.js
Found: 3 matches

📄 src/commands/handler.js
  Line 45: // TODO: Add validation
  Line 128: // TODO: Improve error handling

📄 src/utils/logger.js
  Line 23: // TODO: Add file logging
```

**Features:**
- Recursive search through directories
- Line numbers and content preview
- File grouping
- Configurable result limits

**Limitations:**
- Maximum 50 results per search (configurable)
- Binary files are skipped
- Very large files may be skipped
- Results truncated for WhatsApp message limits

---

### `/diff` - Show Git Diff

Show git diff for a file or directory (changes compared to last commit).

**Usage:**
```
/diff [path]
```

**Examples:**
```
/diff                    # Show all changes
/diff src/index.js       # Show changes for specific file
/diff src/               # Show changes in directory
```

**Aliases:** `/gitdiff`, `/changes`

**Requirements:**
- Git must be installed
- Project must be a git repository
- At least one commit must exist

**Output Format:**
```
📊 Git Diff: src/index.js

```diff
@@ -10,7 +10,7 @@
 
 function main() {
-  console.log('Hello');
+  console.log('Hello World');
 }
```
```

**Features:**
- Standard git diff format
- Syntax highlighting for diff
- Shows added/removed lines
- Works with staged and unstaged changes

**Limitations:**
- Requires git repository
- Large diffs may be truncated
- Only shows changes vs. HEAD commit

---

## Security

All file operation commands implement security measures:

### Path Validation
- All paths are validated against the project root
- Directory traversal attacks (`../../../etc/passwd`) are blocked
- Absolute paths outside the project are blocked
- Only files within the selected project can be accessed

### File Size Limits
- Files larger than 1MB are automatically truncated
- Configurable via `FILE_OPS_MAX_SIZE` environment variable
- Prevents memory exhaustion from large files

### WhatsApp Message Limits
- All output is automatically truncated to fit WhatsApp message limits (4KB)
- Long content includes truncation indicators
- Multiple commands may be needed for large outputs

## Configuration

File operations can be configured via environment variables:

```bash
# .env or .env.example

# Maximum file size for /cat (bytes)
FILE_OPS_MAX_SIZE=1048576          # 1MB default

# Maximum depth for /tree
FILE_OPS_TREE_MAX_DEPTH=5          # 5 levels default

# Maximum results for /search
FILE_OPS_SEARCH_MAX_RESULTS=50     # 50 results default

# Maximum WhatsApp message length
FILE_OPS_WHATSAPP_MAX_LENGTH=4000  # 4KB default
```

## Common Use Cases

### Exploring a New Project
```
/ls                     # See top-level structure
/tree --depth=2         # Get overview of project structure
/cat package.json       # Check project configuration
/search "TODO"          # Find tasks to work on
```

### Debugging
```
/cat src/error-handler.js        # Read error handler
/search --file="*.js" "throw"    # Find all throws
/diff src/                       # See recent changes
```

### Code Review
```
/diff                            # See all changes
/cat src/new-feature.js          # Review new code
/search --file="*.js" "FIXME"    # Find issues
```

## Tips and Best Practices

1. **Use relative paths** - Paths are relative to project root by default
2. **Start with /tree** - Get an overview before diving into specific files
3. **Use file filters** - `/search --file="*.js"` is faster than searching all files
4. **Limit search results** - Use `--limit` to avoid overwhelming output
5. **Check file size first** - Use `/ls` to see file sizes before using `/cat`
6. **Combine commands** - Use `/search` to find files, then `/cat` to read them

## Troubleshooting

### "No active session"
→ Create a session first: `/newsession`

### "No project selected"
→ Select a project: `/project <name>`

### "Path outside project directory"
→ You're trying to access files outside your project. Use paths within the project.

### "File truncated"
→ File is too large. Check configuration or use git/IDE for large files.

### "Not a git repository"
→ `/diff` requires a git repository. Initialize with `git init` if needed.

### Search returns no results
→ Check your pattern, try case-insensitive search, or broader file patterns

## Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| ❌ No active session | No session created | Use `/newsession` |
| ❌ No project selected | No project selected | Use `/project <name>` |
| ❌ Security error | Path validation failed | Use paths within project |
| ❌ File not found | File doesn't exist | Check path with `/ls` |
| ❌ Not a file | Path is a directory | Use `/ls` for directories |
| ❌ Not a directory | Path is a file | Use `/cat` for files |
| ❌ Git not available | Git not installed | Install git |
| ❌ Not a git repository | Project not using git | Initialize git repo |

## Next Steps

After mastering file operations, explore:
- **Phase 5: Git Commands** - Advanced git operations
- **Phase 6: Code Navigation** - Jump to definitions, find references
- **Phase 7: Code Execution** - Run commands and scripts

## Feedback

Found an issue or have a suggestion? File an issue in the CodeBridge repository.
