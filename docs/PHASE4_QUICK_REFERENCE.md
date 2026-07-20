# Phase 4: File Operations - Quick Reference

## 📁 New Commands

### `/ls` - List Directory
```
/ls                    # List current directory
/ls src/              # List specific directory
/ls src/commands      # List subdirectory
```
**Aliases:** `/dir`, `/list`

### `/cat` - Read File
```
/cat package.json     # Read JSON file
/cat src/index.js     # Read source file
/cat README.md        # Read documentation
```
**Aliases:** `/read`, `/view`  
**Note:** Files >1MB are truncated

### `/tree` - Directory Tree
```
/tree                 # Show tree from root
/tree src/            # Show tree from src/
/tree --depth=3       # Limit depth to 3 levels
```
**Aliases:** `/dirtree`  
**Default depth:** 5 levels

### `/search` - Search Files
```
/search "function"              # Search all files
/search "import" src/           # Search in directory
/search --file="*.js" "TODO"    # Filter by file type
/search --limit=20 "error"      # Limit results
```
**Aliases:** `/grep`, `/find`  
**Default:** Case-insensitive, max 50 results

### `/diff` - Git Diff
```
/diff                 # Show all changes
/diff src/index.js    # Show file changes
/diff src/            # Show directory changes
```
**Aliases:** `/gitdiff`, `/changes`  
**Requires:** Git repository

## 🔒 Security

- ✅ All paths validated (no directory traversal)
- ✅ Only files within project accessible
- ✅ Authentication required
- ✅ File size limits enforced

## ⚙️ Configuration

Add to `.env`:
```bash
FILE_OPS_MAX_SIZE=1048576            # 1MB max for /cat
FILE_OPS_TREE_MAX_DEPTH=5            # Max depth for /tree
FILE_OPS_SEARCH_MAX_RESULTS=50       # Max results for /search
FILE_OPS_WHATSAPP_MAX_LENGTH=4000    # Max message length
```

## 📝 Common Patterns

**Explore new project:**
```
/ls
/tree --depth=2
/cat package.json
```

**Find and read:**
```
/search "TODO"
/cat src/tasks.js
```

**Check changes:**
```
/diff
/cat src/modified-file.js
```

## ❓ Troubleshooting

| Error | Solution |
|-------|----------|
| No active session | Use `/newsession` |
| No project selected | Use `/project <name>` |
| Path outside project | Use relative paths |
| File not found | Check path with `/ls` |
| File truncated | File >1MB, check config |

## 📚 Documentation

- User Guide: `docs/COMMAND_SYSTEM_PHASE4.md`
- Implementation: `docs/PHASE4_IMPLEMENTATION_SUMMARY.md`
- Tests: `tests/test-file-commands.js`

---

**Phase 4 Status:** ✅ Complete  
**Next Phase:** Phase 5 - Git Commands
