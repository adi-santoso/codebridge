# CodeBridge Testing Guide

## Integration Status

✅ **CodeBridge Server**: Ready (Phase 5 complete)
✅ **WhatsApp Gateway**: Ready (AI Command Handler integrated)
✅ **Socket.IO Client**: Already integrated in gateway
✅ **Environment Variables**: Configured

## Quick Test (Both Servers Already Running)

Jika kedua server sudah online:

### 1. Check CodeBridge Health
```bash
curl http://localhost:3848/health
```

**Expected:**
```json
{
  "status": "ok",
  "timestamp": 1783916900491,
  "connections": 0
}
```

### 2. Check Gateway Health
```bash
curl -X GET http://localhost:3333/api/health \
  -H "x-api-key: ab64fc4ff220b7cf13de38d993cb8f9b748d001a2ccbffc8cabd248912f19579"
```

**Expected:**
```json
{
  "success": true,
  "status": "healthy",
  "uptime": 12345
}
```

### 3. Check Gateway Logs
Gateway akan otomatis connect ke CodeBridge saat start. Check logs:

```bash
# Terminal yang running gateway
# Expected logs:
[CodeBridgeClient] Connecting to CodeBridge at http://localhost:3848...
[CodeBridgeClient] Connected to CodeBridge, authenticating...
[CodeBridgeClient] ✅ Authenticated with CodeBridge
```

### 4. Test via WhatsApp

Kirim message ke WhatsApp bot:

```
!code /newsession
```

**Expected Response:**
```
✅ New session created: sess_abc123
Use /projects to see available projects.
```

Lanjut:
```
!code /projects
```

**Expected Response:**
```
📁 Available projects (3):
1. codebridge
2. whatsapp
3. [other projects in D:/working/gatrion/]

Use /project <name> to select.
```

Select project:
```
!code /project codebridge
```

**Expected Response:**
```
✅ Project selected: codebridge
Ready for coding! Send your prompts.
```

Send coding prompt:
```
!code list files in current directory
```

**Expected Response:**
```
Here are the files in the current directory:
- package.json
- src/
- tests/
- docs/
...

_AI • 4 msgs • 1234ms_
```

---

## Full Test (Start from Scratch)

### Terminal 1: Start CodeBridge

```bash
cd D:/working/gatrion/codebridge
node src/server.js
```

**Expected Output:**
```
🚀 CodeBridge server running on port 3848
Socket.IO endpoint: http://localhost:3848
Health check: http://localhost:3848/health
Session DB: ./.codebridge/sessions.db
Project root: D:/working/gatrion
```

Leave this terminal running.

---

### Terminal 2: Start WhatsApp Gateway

```bash
cd D:/working/gatrion/whatsapp
npm start
```

**Expected Output:**
```
Server running on port 3333
Dashboard: http://localhost:3333/dashboard
WebSocket server initialized
CodeBridge client initialized
[CodeBridgeClient] Connecting to CodeBridge at http://localhost:3848...
[CodeBridgeClient] Connected to CodeBridge, authenticating...
[CodeBridgeClient] ✅ Authenticated with CodeBridge
```

Gateway akan otomatis:
1. Connect ke CodeBridge
2. Authenticate dengan auth key
3. Listen untuk AI commands dari WhatsApp

Leave this terminal running.

---

### Terminal 3: Test API (Optional)

Test gateway API:

```bash
# Check sessions
curl -X GET http://localhost:3333/api/sessions \
  -H "x-api-key: ab64fc4ff220b7cf13de38d993cb8f9b748d001a2ccbffc8cabd248912f19579"

# Check CodeBridge status (via gateway admin endpoint)
curl -X GET http://localhost:3333/api/admin/codebridge/status \
  -H "x-api-key: ab64fc4ff220b7cf13de38d993cb8f9b748d001a2ccbffc8cabd248912f19579"
```

---

## WhatsApp Testing Flow

### 1. Setup WhatsApp Session

Jika WhatsApp belum tersambung, buka dashboard:

```
http://localhost:3333/dashboard
```

- Klik "Create Session"
- Scan QR code dengan WhatsApp
- Wait for "Ready"

### 2. Send Test Messages

Dari WhatsApp, kirim ke bot nomor:

#### Test 1: Create Session
```
!code /newsession
```

✅ Should create new CodeBridge session with ID

#### Test 2: List Projects
```
!code /projects
```

✅ Should list projects from `D:/working/gatrion/`

#### Test 3: Select Project
```
!code /project codebridge
```

✅ Should select project and spawn DirectClaudeSpawner

#### Test 4: Simple Prompt
```
!code what files are in this directory?
```

✅ Should execute Bash tool and return file list

#### Test 5: Create File
```
!code create a file called test.txt with content "Hello CodeBridge"
```

✅ Should execute Write tool and create file

#### Test 6: Read File
```
!code show me the content of test.txt
```

✅ Should execute Read tool and show file content

#### Test 7: Session Status
```
!code /status
```

✅ Should show current session details

---

## Expected Response Times

- **Session Commands**: <100ms (direct response)
- **Simple Prompts**: 2-5 seconds (Claude processing)
- **Tool Execution**: 
  - Bash: 100ms - 2s
  - Read/Write: <100ms
  - Edit: <200ms
- **Long Responses**: May split into multiple WhatsApp messages

---

## Troubleshooting

### Gateway Can't Connect to CodeBridge

**Symptom:**
```
[CodeBridgeClient] Connection error (attempt 1): connect ECONNREFUSED 127.0.0.1:3848
```

**Solution:**
1. Check CodeBridge is running: `curl http://localhost:3848/health`
2. Check port 3848 not blocked by firewall
3. Check `.env` has correct `CODEBRIDGE_SERVER_URL`

---

### Authentication Failed

**Symptom:**
```
[CodeBridgeClient] ❌ CodeBridge authentication failed
```

**Solution:**
1. Check both `.env` files have same auth key
2. CodeBridge: `SOCKET_AUTH_KEY=codebridge-secret-key-change-in-production`
3. Gateway: `CODEBRIDGE_AUTH_KEY=codebridge-secret-key-change-in-production`
4. Restart both servers

---

### No Response from AI

**Symptom:** User sends `!code` message but no response

**Possible Causes:**

1. **CodeBridge not enabled**
   - Check `.env`: `CODEBRIDGE_ENABLED=true`
   - Restart gateway

2. **User not whitelisted**
   - Check `.env`: `CODEBRIDGE_ALLOWED_NUMBERS=` (empty = allow all)
   - Or add user number: `CODEBRIDGE_ALLOWED_NUMBERS=628123456789`

3. **Wrong command prefix**
   - Check `.env`: `CODEBRIDGE_COMMAND_PREFIX=!code`
   - User must send: `!code <message>`

4. **No active session**
   - User must create session: `!code /newsession`
   - Then select project: `!code /project <name>`

---

### "No project selected" Error

**Symptom:**
```
❌ Error: No project selected for this session
```

**Solution:**
1. List projects: `!code /projects`
2. Select one: `!code /project codebridge`
3. Try prompt again

---

### Tool Execution Timeout

**Symptom:**
```
❌ Error: Command execution timeout
```

**Solution:**
1. Command mungkin terlalu lama (>30s)
2. Simplify command atau split jadi multiple steps
3. Check logs di CodeBridge terminal untuk detail error

---

### Claude CLI Not Found

**Symptom:**
```
Error: spawn claude ENOENT
```

**Solution:**
1. Check Claude CLI installed: `claude --version`
2. Check PATH includes Claude CLI
3. Check PROJECT_ROOT_PATH valid di CodeBridge `.env`

---

## Monitoring

### Check Connection Status

**Gateway Metrics:**
```bash
curl -X GET http://localhost:3333/api/admin/codebridge/status \
  -H "x-api-key: ab64fc4ff220b7cf13de38d993cb8f9b748d001a2ccbffc8cabd248912f19579"
```

**Expected Response:**
```json
{
  "connected": true,
  "authenticated": true,
  "pendingRequests": 0,
  "queueSize": 0,
  "metrics": {
    "totalRequests": 42,
    "successfulRequests": 40,
    "failedRequests": 2,
    "avgResponseTime": 1234,
    "successRate": "95.24%"
  }
}
```

---

### Check Sessions

**CodeBridge Sessions:**
```bash
# Check SQLite database
cd D:/working/gatrion/codebridge
sqlite3 .codebridge/sessions.db "SELECT * FROM sessions;"
```

**Gateway Sessions:**
```bash
curl -X GET http://localhost:3333/api/sessions \
  -H "x-api-key: ab64fc4ff220b7cf13de38d993cb8f9b748d001a2ccbffc8cabd248912f19579"
```

---

## Performance Tips

1. **Keep Sessions Alive**: Don't create new session per message
2. **Use Same Project**: Switching projects restarts Claude subprocess
3. **Batch Commands**: Multiple simple commands faster than one complex command
4. **Monitor Metrics**: Check gateway metrics for bottlenecks

---

## Security Notes

1. **Auth Keys**: Change default auth keys in production
2. **Whitelist**: Set `CODEBRIDGE_ALLOWED_NUMBERS` untuk restrict access
3. **Rate Limiting**: Gateway has built-in rate limiting per user
4. **Path Sandboxing**: Tools can only access files in project directory

---

## Next Steps After Testing

Once testing successful:

1. **Production Setup**
   - Change auth keys
   - Configure whitelist
   - Setup systemd/PM2 for auto-restart
   - Configure logging
   - Setup monitoring

2. **User Training**
   - Create user guide for session commands
   - Document available coding commands
   - Create examples for common tasks

3. **Optimization**
   - Monitor response times
   - Tune rate limits
   - Configure session cleanup intervals
   - Optimize tool execution timeouts

---

## Support

**Logs:**
- CodeBridge: Terminal output
- Gateway: Terminal output + `/api/admin/logs` endpoint

**Databases:**
- CodeBridge sessions: `.codebridge/sessions.db`
- Gateway sessions: `./data/sessions.db`

**Documentation:**
- CodeBridge: `docs/phase5-complete.md`
- Gateway: `README.md`
- Integration: `docs/GATEWAY_INTEGRATION.md`
