# Phase 8: Templates & Shortcuts - User Guide

Templates are pre-configured workflows that help you accomplish common coding tasks faster. Each template is optimized for a specific use case with specialized system prompts and smart context extraction.

## Available Commands

### 1. `/ask` - Quick Question Mode

Get brief, focused answers to your questions without lengthy explanations.

**Usage:**
```
/ask <question>
```

**Aliases:** `/q`, `/question`

**Examples:**
```
/ask how to handle async errors in node.js
/ask what is the difference between let and const
/ask best practice for error handling in express
/ask how do I use reduce in javascript
```

**Features:**
- Concise answers (2-3 sentences max)
- Practical, actionable solutions
- Minimal working code examples when needed
- No context files read (pure Q&A)

**Best for:**
- Quick clarifications
- Syntax questions
- Best practice lookups
- Concept explanations

---

### 2. `/fix` - Auto-Fix Errors

Analyze error messages and get solutions with root cause explanations.

**Usage:**
```
/fix <error message>
```

**Aliases:** `/fixerror`

**Examples:**
```
/fix TypeError: Cannot read property 'map' of undefined
/fix SyntaxError: Unexpected token } at app.js:42
/fix ReferenceError: useState is not defined
/fix Error: ENOENT: no such file or directory
```

**Features:**
- **Smart file extraction**: Automatically reads files mentioned in error stack traces
- **Root cause analysis**: Explains what's actually wrong, not just symptoms
- **Specific fix**: Code or steps to fix the issue
- **Prevention tips**: How to avoid this error in the future

**Best for:**
- Runtime errors
- Compilation errors
- Configuration issues
- Dependency problems

---

### 3. `/review` - Code Review

Get a comprehensive code review with security, performance, and best practice checks.

**Usage:**
```
/review <file>
```

**Aliases:** `/codereview`

**Examples:**
```
/review src/auth/login.js
/review src/utils/validator.ts
/review src/components/UserList.tsx
```

**Features:**
- **Bug & Logic Errors**: Potential runtime errors, edge cases
- **Security Issues**: SQL injection, XSS, auth bypasses, data exposure
- **Performance**: Inefficient algorithms, memory leaks
- **Code Style**: Naming, structure, maintainability
- **Testing**: Missing validations, error handling

**Output Format:**
- Organized by category
- Specific line references
- Priority levels (🔴 Critical, 🟡 Moderate, 🟢 Minor)
- Actionable suggestions
- Positive feedback on good practices

**Best for:**
- Pre-commit reviews
- Refactoring planning
- Security audits
- Code quality checks

---

### 4. `/test` - Generate Unit Tests

Generate comprehensive unit tests with automatic framework detection.

**Usage:**
```
/test <file>
```

**Aliases:** `/unittest`, `/generatetest`

**Examples:**
```
/test src/utils/validator.js
/test src/services/auth.ts
/test src/api/users.js
```

**Features:**
- **Auto-detect framework**: Reads `package.json` to detect Jest, Mocha, Vitest, etc.
- **AAA pattern**: Arrange, Act, Assert structure
- **Comprehensive coverage**:
  - Happy path tests
  - Edge cases (null, undefined, empty, boundaries)
  - Error handling tests
  - Mocks for dependencies
- **Descriptive names**: Clear test descriptions

**Output:**
Complete, runnable test code following your project's conventions.

**Best for:**
- TDD (Test-Driven Development)
- Adding tests to legacy code
- Coverage improvements
- Learning testing patterns

---

### 5. `/doc` - Generate Documentation

Generate comprehensive documentation with examples and API references.

**Usage:**
```
/doc <file>
```

**Aliases:** `/document`, `/docs`

**Examples:**
```
/doc src/api/users.js
/doc src/utils/helpers.ts
/doc src/services/payment.js
```

**Features:**
- **Purpose & Overview**: What the code does and why
- **API Documentation**:
  - Function parameters and return values
  - Class constructors, methods, properties
  - Type information
- **Usage Examples**: Practical, copy-pasteable examples
- **Edge Cases**: What to watch out for
- **Dependencies**: What the code depends on

**Output Format:**
- Language-appropriate format (JSDoc, docstrings, etc.)
- Inline code documentation
- README-style usage guide

**Best for:**
- Public APIs
- Library functions
- Onboarding new developers
- Open source projects

---

### 6. `/refactor` - Refactoring Suggestions

Get refactoring suggestions with before/after examples.

**Usage:**
```
/refactor <file>
```

**Aliases:** `/improve`

**Examples:**
```
/refactor src/services/payment.js
/refactor src/components/UserList.tsx
/refactor src/utils/database.ts
```

**Features:**
Analyzes code for:
- **Code Organization**: Structure, separation of concerns, modularity
- **Naming**: Variable, function, class names (clarity & consistency)
- **Complexity**: Cyclomatic complexity, nested logic, long functions
- **Duplication**: Repeated code, abstraction opportunities
- **Testability**: Dependency injection, pure functions, mockability

**Output Format:**
For each suggestion:
1. **Why**: Explanation of the improvement
2. **Before**: Current code excerpt
3. **After**: Refactored version
4. **Tradeoffs**: Any considerations

**Best for:**
- Code cleanup
- Technical debt reduction
- Architecture improvements
- Learning better patterns

---

## Tips for Effective Usage

### 1. **Choose the Right Template**

- **Quick questions?** Use `/ask`
- **Error debugging?** Use `/fix`
- **Need feedback?** Use `/review`
- **Need tests?** Use `/test`
- **Need docs?** Use `/doc`
- **Improve code?** Use `/refactor`

### 2. **Provide Clear Paths**

Templates work best with specific file paths:

✅ Good:
```
/review src/auth/login.js
/test src/utils/validator.js
```

❌ Avoid:
```
/review that file I was working on
/test the validator
```

### 3. **Context Matters**

- `/ask` - No context needed (pure Q&A)
- `/fix` - Automatically reads files from error stack traces
- `/review`, `/test`, `/doc`, `/refactor` - Read the specified file

Make sure files exist at the specified path.

### 4. **Use Aliases for Speed**

Shortcuts save time:
```
/q instead of /ask
/codereview instead of /review
/improve instead of /refactor
```

### 5. **Combine with Other Commands**

Templates work great with other CodeBridge features:

```bash
# Review a file first
/review src/auth.js

# Then refactor based on suggestions
/refactor src/auth.js

# Generate tests for the refactored code
/test src/auth.js

# Document the final version
/doc src/auth.js
```

### 6. **WhatsApp Message Length**

Template responses can be long (code reviews, tests, documentation). They will be automatically split into multiple WhatsApp messages if needed.

---

## Requirements

All template commands require:
1. **Active Session**: Use `/newsession` first
2. **Project Selected**: Use `/project <name>` to select your project
3. **Valid Paths**: For file-based templates, ensure paths are correct

---

## Rate Limits

Templates are more resource-intensive than regular commands:

| Command | Rate Limit |
|---------|------------|
| `/ask` | 30 per minute |
| `/fix` | 20 per minute |
| `/review` | 10 per minute |
| `/test` | 10 per minute |
| `/doc` | 15 per minute |
| `/refactor` | 10 per minute |

---

## Configuration

Templates can be configured via environment variables:

```bash
# .env
TEMPLATE_ENABLED=true                # Enable/disable templates
TEMPLATE_MAX_CONTEXT_SIZE=512000     # Max context size (500KB)
TEMPLATE_TIMEOUT=60000               # Execution timeout (60s)
```

---

## Examples: Real-World Workflows

### Workflow 1: Debugging

```bash
# 1. Hit an error
/fix TypeError: Cannot read property 'map' of undefined at app.js:42

# 2. Get detailed review of the problematic file
/review src/app.js

# 3. Refactor based on suggestions
/refactor src/app.js

# 4. Add tests to prevent regression
/test src/app.js
```

### Workflow 2: New Feature

```bash
# 1. Quick question about approach
/ask best way to implement pagination in express

# 2. After coding, review the implementation
/review src/api/users.js

# 3. Generate tests
/test src/api/users.js

# 4. Generate documentation
/doc src/api/users.js
```

### Workflow 3: Code Cleanup

```bash
# 1. Get refactoring suggestions
/refactor src/legacy/payment.js

# 2. After refactoring, review the changes
/review src/legacy/payment.js

# 3. Ensure tests still cover the code
/test src/legacy/payment.js

# 4. Update documentation
/doc src/legacy/payment.js
```

---

## Troubleshooting

### "No active session"
```bash
/newsession
/projects
/project myproject
```

### "No project selected"
```bash
/projects
/project myproject
```

### "Template execution failed"
- Check if file path is correct
- Ensure file is readable
- Check file size (max 500KB for context)
- Try again (might be temporary timeout)

### "File not found"
- Use relative paths from project root
- Use `/ls` to verify path
- Check for typos

---

## Feedback & Customization

Templates are designed for common use cases. If you need:
- Different response styles
- Custom templates
- Additional context strategies
- Integration with other tools

See `docs/PHASE8_IMPLEMENTATION_SUMMARY.md` for extension guide.

---

## Next Steps

Now that you know how to use templates:

1. Try `/ask` for quick questions
2. Use `/review` on a file you're working on
3. Generate tests with `/test`
4. Explore other commands with `/help`

Happy coding! 🚀
