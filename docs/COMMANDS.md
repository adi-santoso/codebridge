# CodeBridge - Commands Reference

Complete reference untuk semua commands yang available di CodeBridge.

---

## Command Format

Commands diawali dengan `/` (slash). Kirim via WhatsApp ke bot.

```
/command [required_param] <optional_param>
```

---

## Available Commands

### 1. `/help`

Tampilkan daftar semua commands yang available.

**Usage:**
```
/help
```

**Response:**
```
🤖 CodeBridge Commands

Project Management:
• /projects - List all projects
• /switch <name> - Switch project
• /current - Current project info

Session:
• /status - Session status
• /reset - Reset conversation
• /history - View history

System:
• /help - Show this help

For coding, just send your message normally:
"fix bug di UserController"
"add validation to form"
```

**Aliases:** None

---

### 2. `/projects`

Tampilkan semua project yang tersedia dengan info detail.

**Usage:**
```
/projects
```

**Response:**
```
📁 Available Projects

1. [*] laravel-api
   📂 /home/user/projects/laravel-api
   📝 Laravel REST API Project
   
2. [ ] react-dashboard
   📂 /home/user/projects/react-dashboard
   📝 React Admin Dashboard
   
3. [ ] mobile-app
   📂 /home/user/projects/mobile-app
   📝 React Native Mobile App

Current: laravel-api
Use /switch <name> to change
```

**Legend:**
- `[*]` = Currently active
- `[ ]` = Available

**Aliases:** `/list`, `/ls`

---

### 3. `/switch [project_name]`

Switch ke project yang berbeda.

**Usage:**
```
/switch react-dashboard
```

**Parameters:**
- `project_name` (required): Nama project yang valid (lihat di `/projects`)

**Response (Success):**
```
✓ Switched to project: react-dashboard

📂 Path: /home/user/projects/react-dashboard
📝 React Admin Dashboard

Ready to code! 🚀
```

**Response (Error - Project Not Found):**
```
❌ Project not found: invalid-name

Available projects:
• laravel-api
• react-dashboard
• mobile-app

Use /projects to see details
```

**Notes:**
- Switching akan kill current Claude instance dan spawn yang baru
- Conversation history current project akan disimpan
- New project mulai dengan clean context

**Aliases:** `/use`, `/cd`

---

### 4. `/current`

Tampilkan informasi project yang sedang aktif.

**Usage:**
```
/current
```

**Response:**
```
📍 Current Project

Name: laravel-api
Path: /home/user/projects/laravel-api
Description: Laravel REST API Project

Settings:
• Auto Commit: Off
• Auto Test: On

Last activity: 5 minutes ago
Messages in session: 12
```

**Aliases:** `/pwd`, `/info`

---

### 5. `/status`

Tampilkan status session lengkap.

**Usage:**
```
/status
```

**Response:**
```
📊 Session Status

User: 628123456789
Project: laravel-api
Path: /home/user/projects/laravel-api

Session Info:
• Active since: 2024-06-27 17:30:00
• Total messages: 15
• Last activity: 2 minutes ago
• Idle for: 2 minutes

Instance:
• Status: Running
• Memory: ~250MB
• Uptime: 15 minutes

System:
• Active sessions: 3 / 10
• Server load: Normal
```

**Aliases:** `/stats`, `/info`

---

### 6. `/reset`

Reset conversation history. Berguna untuk start fresh atau saat context terlalu panjang.

**Usage:**
```
/reset
```

**Confirmation Required:**
```
⚠️ Reset Conversation?

This will:
• Clear all conversation history
• Keep current project (laravel-api)
• Restart Claude instance

Reply:
• /reset confirm - Proceed
• /reset cancel - Cancel
```

**After Confirmation:**
```
✓ Conversation reset

Project: laravel-api still active
Fresh context ready 🚀
```

**Notes:**
- History akan dihapus dari memory
- Session file akan di-backup sebelum direset
- Current project tetap aktif

**Aliases:** `/clear`, `/restart`

---

### 7. `/history [limit]`

Tampilkan conversation history.

**Usage:**
```
/history
/history 5
```

**Parameters:**
- `limit` (optional): Jumlah messages terakhir (default: 10)

**Response:**
```
📜 Conversation History (Last 5)

1. [17:30] You:
   fix bug di UserController line 45

2. [17:31] Assistant:
   I'll fix the bug in UserController...

3. [17:35] You:
   add validation to email field

4. [17:36] Assistant:
   I've added email validation...

5. [17:40] You:
   /status

Total messages: 12
Use /reset to clear history
```

**Aliases:** `/log`, `/messages`

---

## Coding Commands (No Slash)

Untuk coding tasks, kirim message biasa **tanpa** slash `/`.

### Examples:

**Bug Fixing:**
```
fix bug di UserController line 45
```

**Feature Request:**
```
tambahkan validation email di form register
```

**Code Review:**
```
review function getUserData, ada yang bisa dioptimize?
```

**Refactoring:**
```
refactor UserController jadi lebih clean dan follow SOLID principles
```

**File Operations:**
```
create new file UserRepository.php with basic CRUD methods
```

**Testing:**
```
buatkan unit test untuk UserService
```

**Documentation:**
```
add docblock comments to all public methods in UserController
```

**Search:**
```
cari semua file yang pakai function deprecated_function
```

---

## Command Responses

### Success Response Format
```
✓ [Action completed successfully]

[Details or confirmation]
```

### Error Response Format
```
❌ [Error title]

[Error details]
[Suggested action]
```

### Info Response Format
```
ℹ️ [Information title]

[Details]
```

---

## Tips & Best Practices

### 1. Be Specific
```
❌ fix bug
✓ fix null pointer exception di UserController line 45
```

### 2. One Task at a Time
```
❌ fix bug, add validation, dan refactor controller
✓ fix bug di login form
```

Selesaikan satu task dulu, baru request yang lain.

### 3. Provide Context
```
❌ update function
✓ update function getUserData di UserService, return full user object instead of just ID
```

### 4. Use Commands for Management
```
✓ /switch laravel-api   (untuk ganti project)
✓ /status               (untuk cek status)
❌ ganti ke project laravel-api  (terlalu ambiguous)
```

### 5. Check Status When Needed
Jika response lambat atau tidak ada response:
```
/status
```

---

## Advanced Usage

### Multi-line Prompts

WhatsApp support multi-line messages:

```
update UserController:
1. Add email validation
2. Add rate limiting
3. Improve error messages
```

### Code Snippets

Kirim code snippet untuk review atau fix:

```
review this code:

public function login($email, $password) {
    $user = User::where('email', $email)->first();
    return $user;
}
```

### Context from Previous Messages

Claude akan ingat conversation history:

```
You: create User model
Bot: [creates User model]

You: sekarang buatkan migration untuk model itu
Bot: [creates migration based on previous User model]
```

---

## Command Aliases

| Command | Aliases |
|---------|---------|
| `/projects` | `/list`, `/ls` |
| `/switch` | `/use`, `/cd` |
| `/current` | `/pwd`, `/info` |
| `/status` | `/stats` |
| `/reset` | `/clear`, `/restart` |
| `/history` | `/log`, `/messages` |

---

## Error Messages

### Common Errors

**1. Project Not Found**
```
❌ Project not found: wrong-name

Use /projects to see available projects
```

**2. Rate Limit**
```
⏱️ Too Many Requests

You've sent too many messages.
Please wait 30 seconds.
```

**3. Session Limit Reached**
```
⚠️ Server Busy

Max concurrent sessions reached.
Please try again in a few minutes.
```

**4. Invalid Command**
```
❌ Unknown command: /invalid

Type /help to see available commands
```

**5. Claude Instance Error**
```
❌ Coding Assistant Error

Failed to process your request.
Retrying... (attempt 1/3)
```

---

## Special Features

### 1. Auto-Retry

Jika request gagal, bot akan auto-retry up to 3 times:

```
⚠️ Request failed, retrying... (1/3)
```

### 2. Typing Indicator

Bot akan show "typing..." saat processing request.

### 3. Long Response Handling

Jika response terlalu panjang, akan di-split ke multiple messages:

```
[Message 1/3]
...

[Message 2/3]
...

[Message 3/3]
...
```

### 4. Code Formatting

Code akan diformat dengan ``` (triple backtick) untuk readability:

```
```php
public function example() {
    return true;
}
```
```

---

## Troubleshooting Commands

### Bot tidak respond?

1. Check status:
```
/status
```

2. Reset jika perlu:
```
/reset
```

3. Contact admin jika masih tidak respond

### Wrong project active?

```
/current      # Check current project
/switch <name>  # Switch to correct project
```

### Lost conversation context?

```
/history     # Review recent messages
```

### Need fresh start?

```
/reset       # Clear history, keep project
/switch <name>  # Change project entirely
```

---

## Quick Reference Card

```
Essential Commands:
/help       - Show help
/projects   - List projects
/switch     - Change project
/status     - Check status
/reset      - Clear history

For coding: just send your message!
No slash needed.
```

---

**Last Updated:** 2024-06-27  
**Version:** 1.0
