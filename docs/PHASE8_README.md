# Phase 8: Templates & Shortcuts - Quick Reference

## 🎯 What's New

Phase 8 adds **6 template-based commands** that provide pre-configured workflows for common coding tasks:

| Command | Purpose | Example |
|---------|---------|---------|
| `/ask` | Quick questions | `/ask how to handle async errors` |
| `/fix` | Auto-fix errors | `/fix TypeError: Cannot read property 'map'` |
| `/review` | Code review | `/review src/auth/login.js` |
| `/test` | Generate tests | `/test src/utils/validator.js` |
| `/doc` | Generate docs | `/doc src/api/users.js` |
| `/refactor` | Refactoring tips | `/refactor src/services/payment.js` |

**Total Commands:** 48 (42 from previous phases + 6 new)

## 🚀 Quick Start

```bash
# 1. Setup session
/newsession
/project myproject

# 2. Use templates
/ask what is async await
/fix TypeError at app.js:42
/review src/auth.js
/test src/utils.js
/doc src/api.js
/refactor src/legacy.js
```

## 📖 Documentation

- **User Guide:** [`docs/COMMAND_SYSTEM_PHASE8.md`](./COMMAND_SYSTEM_PHASE8.md)
- **Implementation:** [`docs/PHASE8_IMPLEMENTATION_SUMMARY.md`](./PHASE8_IMPLEMENTATION_SUMMARY.md)

## 🔧 Configuration

```bash
# .env
TEMPLATE_ENABLED=true
TEMPLATE_MAX_CONTEXT_SIZE=512000  # 500KB max
TEMPLATE_TIMEOUT=60000            # 60s timeout
```

## ✅ Verification

```bash
# Run verification
node scripts/verify-phase8.js

# Run tests
npm test tests/test-template-commands.js

# Syntax check
node --check src/commands/handlers/template.js
```

## 📁 Files

### Created (11 files):
- `src/commands/templates/ask.js`
- `src/commands/templates/fix.js`
- `src/commands/templates/review.js`
- `src/commands/templates/test.js`
- `src/commands/templates/doc.js`
- `src/commands/templates/refactor.js`
- `src/commands/handlers/template.js`
- `tests/test-template-commands.js`
- `docs/COMMAND_SYSTEM_PHASE8.md`
- `docs/PHASE8_IMPLEMENTATION_SUMMARY.md`
- `scripts/verify-phase8.js`

### Modified (3 files):
- `src/commands/registry.js` (6 commands registered)
- `src/commands/handler.js` (template routing)
- `.env.example` (configuration)

## 🎨 Features

### Smart Context Extraction
Templates automatically read relevant files:
- `/fix` extracts file paths from error messages
- `/review`, `/test`, `/doc`, `/refactor` read specified files
- `/test` also reads `package.json` for framework detection
- `/refactor` reads related files in the same directory

### Optimized System Prompts
Each template has specialized instructions:
- `/ask` - Brief, focused answers
- `/fix` - Root cause + solution + prevention
- `/review` - Security, performance, best practices
- `/test` - AAA pattern with full coverage
- `/doc` - API docs with examples
- `/refactor` - Before/after with explanations

### Rate Limiting
```
/ask:      30 calls/min  (lightweight)
/fix:      20 calls/min  (moderate)
/review:   10 calls/min  (heavy)
/test:     10 calls/min  (heavy)
/doc:      15 calls/min  (moderate)
/refactor: 10 calls/min  (heavy)
```

## 🔐 Security

✅ **Safe:**
- Files only within project directory
- Respects ignore patterns (Phase 7)
- Size limits (500KB max context)
- Path validation (no directory traversal)

❌ **Blocked:**
- Files outside project
- Ignored patterns (node_modules, .git)
- Oversized files
- Unsafe paths

## 🧪 Testing

```bash
# Run all template tests
npm test tests/test-template-commands.js

# Test specific command
node -e "
import('./src/commands/handler.js').then(async ({ CommandHandler }) => {
  // Setup and test here
});
"
```

## 🎯 Use Cases

### Debugging Workflow
```bash
/fix TypeError: Cannot read property 'map' of undefined at app.js:42
/review src/app.js
/refactor src/app.js
/test src/app.js
```

### New Feature Workflow
```bash
/ask best way to implement pagination in express
# ... write code ...
/review src/api/users.js
/test src/api/users.js
/doc src/api/users.js
```

### Code Cleanup Workflow
```bash
/refactor src/legacy/payment.js
# ... apply suggestions ...
/review src/legacy/payment.js
/test src/legacy/payment.js
/doc src/legacy/payment.js
```

## 🚧 Known Limitations

1. **System Prompt**: DirectClaudeSpawner doesn't support dynamic system prompts (workaround: prepend to message)
2. **Context Strategies**: Only `none` and `file` implemented (future: `directory`, `project`)
3. **Response Chunking**: Long responses include length warning (future: auto-split)
4. **Template Customization**: Templates are hardcoded (future: user-defined templates)

## 🔮 Future Enhancements

- **Phase 8.1**: Advanced context strategies (directory, project, related files)
- **Phase 8.2**: Smart response chunking for WhatsApp
- **Phase 8.3**: Template marketplace (user-defined templates)
- **Phase 8.4**: Language-specific templates (Python, Java, Go)
- **Phase 8.5**: Multi-file templates (PR review, coverage analysis)

## 📊 Statistics

- **Lines of Code:** ~1,200
- **Commands Added:** 6
- **Templates Created:** 6
- **Test Cases:** 30+
- **Documentation Pages:** 2

## ✨ Integration

Templates integrate seamlessly with existing phases:
- **Phase 1**: Command registry, handler, middleware
- **Phase 2**: Session management
- **Phase 3**: Tool control (not used directly)
- **Phase 4**: File operations (for context extraction)
- **Phase 5**: Response modes (could be combined)
- **Phase 6**: Debug logging, error tracking
- **Phase 7**: Context management, ignore patterns

## 🎓 Learning Resources

1. **User Guide**: Read `docs/COMMAND_SYSTEM_PHASE8.md` for examples
2. **Implementation**: Read `docs/PHASE8_IMPLEMENTATION_SUMMARY.md` for architecture
3. **Code**: Read `src/commands/handlers/template.js` for implementation
4. **Extension Guide**: See "Adding a New Template" in implementation summary

## ❓ FAQ

**Q: How do templates differ from regular messages?**  
A: Templates have specialized system prompts and automatic context extraction.

**Q: Can I create custom templates?**  
A: Not yet (Phase 8.3 will add this). For now, modify template files directly.

**Q: Do templates work without projects?**  
A: No, all templates require an active session with a selected project.

**Q: How much context do templates use?**  
A: Max 500KB per execution (configurable via `TEMPLATE_MAX_CONTEXT_SIZE`).

**Q: Can templates read my entire project?**  
A: No, templates only read specified files (with size limits and ignore patterns).

## 🤝 Contributing

To add a new template:

1. Create template definition in `src/commands/templates/`
2. Add handler in `src/commands/handlers/template.js`
3. Register in `src/commands/registry.js`
4. Add tests in `tests/test-template-commands.js`
5. Update documentation

See "Extension Guide" in implementation summary for details.

## 📝 License

Same as CodeBridge project license.

---

**Status:** ✅ Complete  
**Version:** 1.0.0  
**Last Updated:** 2024  
**Author:** CodeBridge Team
