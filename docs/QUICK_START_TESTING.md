# Quick Start: Testing Phase 1 Command System

## 🚀 Quick Test (5 minutes)

### Step 1: Run Automated Tests
```bash
cd D:/working/gatrion/codebridge
npm run test:commands
```

Expected output:
```
✅ Command Parser tests passed
✅ Command Registry tests passed
✅ All basic command tests passed
✅ Rate limiting works
✅ Command history logging works
✅ Whitelist authentication works
=== All Tests Passed ✅ ===
```

### Step 2: Check Database Schema
```bash
sqlite3 .codebridge/sessions.db ".schema command_history"
sqlite3 .codebridge/sessions.db ".schema user_preferences"
```

Expected: Should show table definitions

### Step 3: Manual Test Commands

Start CodeBridge:
```bash
npm start
```

Send via WhatsApp (in order):

1. `/help` → Should show all commands
2. `/ping` → Should return pong
3. `/version` → Should show version
4. `/status` → Should show status
5. `/newsession` → Should create session
6. `/status` → Should show updated status

**If all 6 commands work → ✅ Phase 1 is working!**

---

## 🧪 Detailed Testing (15 minutes)

### Test 1: Help System
```
/help
/help status
/help ping
/help unknown
```

### Test 2: Health Check
```
/ping
/heartbeat  (alias test)
```

### Test 3: Version Info
```
/version
/v  (alias test)
/ver  (alias test)
```

### Test 4: Status Display
```
/status
/info  (alias test)
```

### Test 5: Session Management
```
/newsession
/status
/projects
/project codebridge
/status
/sessions
```

### Test 6: Rate Limiting
Send `/ping` 35 times rapidly. Should hit limit around 30-31st call.

### Test 7: Error Handling
```
/unknown
/session  (missing arg)
/project  (missing arg)
```

### Test 8: Authentication
Try command from unauthorized number → Should get no response

---

## 📊 Verify Results

### Check Command History
```bash
sqlite3 .codebridge/sessions.db "SELECT command, success, datetime(executedAt/1000, 'unixepoch') as time FROM command_history ORDER BY executedAt DESC LIMIT 10;"
```

Should show your recent commands

### Check User Preferences Table
```bash
sqlite3 .codebridge/sessions.db "SELECT * FROM user_preferences;"
```

Should exist (empty is OK for Phase 1)

### Check Logs
Look for log entries like:
```
ℹ️ [CommandHandler] Command executed: help
✅ [CommandHandler] Command completed: help (15ms)
```

---

## ✅ Success Criteria

Phase 1 is working if:

- [ ] All automated tests pass
- [ ] `/help` shows all commands
- [ ] `/ping` returns pong
- [ ] `/version` shows version
- [ ] `/status` shows session info
- [ ] Rate limiting works (blocks after 30 pings)
- [ ] Unknown commands show error
- [ ] Commands logged to database
- [ ] Existing commands still work
- [ ] No errors in console

---

## 🐛 Troubleshooting

### Problem: Tests fail
**Solution:**
```bash
# Check syntax
node --check src/commands/handler.js
node --check src/commands/registry.js
node --check src/commands/middleware.js

# Check imports
node -e "import('./src/commands/handler.js')"
```

### Problem: Commands not recognized
**Check:**
1. Message starts with `/`
2. Command is registered in registry.js
3. Handler is imported correctly
4. Check logs for errors

### Problem: Database errors
**Solution:**
```bash
# Check database exists
ls -la .codebridge/sessions.db

# Check schema
sqlite3 .codebridge/sessions.db ".tables"

# Should show: command_history, sessions, user_preferences
```

### Problem: Rate limit not working
**Check:**
- middleware.js is imported
- Rate limit cleanup is running
- Check logs for rate limit messages

### Problem: Whitelist blocks everyone
**Check:**
```bash
# Verify .env has correct numbers
grep ALLOWED_WHATSAPP_NUMBERS .env

# Format: 6285727042754 (no + or spaces)
```

---

## 📝 Test Checklist

Quick verification checklist:

```
✅ Automated tests pass
✅ /help works
✅ /ping works  
✅ /version works
✅ /status works
✅ /newsession works
✅ /sessions works
✅ /projects works
✅ Rate limiting works
✅ Error handling works
✅ Commands logged to DB
✅ No console errors
✅ Backward compatibility OK
```

If all checked → **Phase 1 is complete and working!**

---

## 🎉 Next Steps

After successful testing:

1. **Deploy to staging** (if available)
2. **Test with real WhatsApp gateway**
3. **Monitor for 24-48 hours**
4. **Deploy to production**
5. **Start Phase 2 planning**

---

## 📞 Quick Reference

**Run tests:** `npm run test:commands`

**Check DB:** `sqlite3 .codebridge/sessions.db`

**View logs:** Check console output

**Verify files:**
```bash
ls -la src/commands/
ls -la src/commands/handlers/
ls -la docs/COMMAND_SYSTEM*.md
```

**Check configuration:**
```bash
grep COMMAND_ .env.example
```

---

**Estimated Time:** 5-15 minutes  
**Prerequisites:** CodeBridge installed, Node.js 18+  
**Difficulty:** Easy

**Happy Testing! 🚀**
