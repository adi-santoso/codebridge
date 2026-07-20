# Response Control Commands - User Guide

## Overview

Response Control allows you to customize how Claude responds to your messages. Choose between different verbosity levels and response formats to match your workflow.

## Available Commands

### `/brief` - Concise Mode
Set responses to be brief and direct.

**When to use:**
- Quick answers
- Familiar topics  
- Limited screen space
- Just the essentials

**Characteristics:**
- Concise, direct answers
- Bullet points preferred
- Max 3 sentences (unless code involved)
- Minimal explanations

---

### `/balanced` - Default Mode  
Restore default response mode.

**When to use:**
- Most situations (recommended default)
- Clear explanations with code
- Learning new concepts
- General development

**Characteristics:**
- Moderate detail
- Clear explanations with context
- Code examples with comments
- Balance of brevity and thoroughness

---

### `/detailed` - Comprehensive Mode
Set responses to be thorough and verbose.

**When to use:**
- Learning complex topics
- Comprehensive understanding needed
- Edge cases and gotchas important
- Troubleshooting difficult issues

**Characteristics:**
- Comprehensive explanations
- Step-by-step breakdowns
- Context and background
- Multiple examples
- Edge case considerations
- ⚠️ Longer responses

---

### `/code-only` - Code Without Explanation
Only output code, no explanations.

**When to use:**
- Just need implementation
- Already understand concept
- Quick copy-paste
- Rapid prototyping

**Characteristics:**
- Only code blocks
- No explanations
- File paths as comments
- Pure implementation

---

### `/explain-only` - Explanation Without Code
Explain concepts without code implementation.

**When to use:**
- Understanding concepts
- Architecture and design
- Code reviews or planning
- "Why" before "how"

**Characteristics:**
- Conceptual explanations
- Pseudocode or descriptions
- Focus on "why" and "how"
- No actual code

---

## Command Reference

```bash
/brief          # Set brief mode
/balanced       # Set balanced mode (default)
/detailed       # Set detailed mode
/code-only      # Set code-only mode
/explain-only   # Set explain-only mode
```

**Aliases:**
```bash
/normal         # → /balanced
/verbose        # → /detailed
/codeonly       # → /code-only
/explainonly    # → /explain-only
```

---

## How It Works

1. **Persistent**: Your mode preference is saved and persists across sessions
2. **Session-Level**: Applied immediately to your active session
3. **System Prompt Enhancement**: Mode instructions are prepended to your messages
4. **Mode as Hint**: Not strict enforcement - Claude may adjust based on context

---

## Important Notes

**Limitations:**
- Mode is a hint, not strict enforcement
- Claude may adjust based on question complexity
- Changes don't affect previous messages
- Long responses may be truncated by WhatsApp

**Prerequisites:**
- Active session required (`/newsession`)
- Project must be selected (`/project <name>`)

---

## Configuration

Administrators can configure response modes via environment variables:

```bash
# .env
RESPONSE_MODE_DEFAULT=balanced       # Default: balanced
RESPONSE_ALLOW_CODE_ONLY=true        # Allow /code-only
RESPONSE_ALLOW_EXPLAIN_ONLY=true     # Allow /explain-only
```

---

## See Also

- [Command System Overview](./COMMAND_SYSTEM_OVERVIEW.md)
- [Session Management (Phase 2)](./COMMAND_SYSTEM_PHASE2.md)
- [Debug Commands (Phase 6)](./COMMAND_SYSTEM_PHASE6.md)
