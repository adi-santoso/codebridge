# CodeBridge Gateway Client Refactoring

## Summary

CodeBridge telah diubah dari **Socket.IO Server** menjadi **Socket.IO Client** yang connect ke Gateway Server eksternal.

## Architecture Changes

### Before (Server Mode)
```
WhatsApp Gateway → Socket.IO → CodeBridge Server → SessionManager → Claude
```

### After (Client Mode)
```
WhatsApp Gateway (https://chat.gatrion.my.id) → Socket.IO Server
                ↓ (whatsapp:message event)
CodeBridge Client → GatewayClient → SessionManager → Claude
                ↓ (codebridge:response event)
WhatsApp Gateway → User's WhatsApp
```

## Files Changed

### Archived Files (src/archive/)
- `server-old.js` - Old Socket.IO server entry point
- `socket-old/connection-manager.js` - Server-side connection manager
- `socket-old/event-handlers.js` - Server-side event handlers
- `socket-config.js` - Server configuration

### New Files
1. **src/gateway-client.js**
   - Socket.IO client untuk connect ke Gateway
   - Handle reconnection otomatis
   - Manage room joins/leaves
   - Listen untuk `whatsapp:message` events
   - Emit `codebridge:response` back ke Gateway

2. **src/session-room-manager.js**
   - Track active session rooms
   - Auto join room saat session created
   - Auto leave room saat session closed
   - Re-join all rooms after reconnect

3. **src/main.js**
   - New entry point
   - Initialize GatewayClient
   - Initialize SessionManager
   - Wire components together
   - Handle graceful shutdown

### Updated Files
1. **src/claude/session-manager.js**
   - Added event emitters: `session-created`, `session-closed`
   - Added helper methods: `getAllSessions()`, `getTotalSessions()`, `getActiveSessions()`, `getSession()`
   - Added `initialize()` method for async initialization
   - Fixed double brace bug in `closeSession()`

2. **src/database/session-db.js**
   - Added `getAllSessions()` method

3. **.env**
   - Changed `SOCKET_PORT` → archived
   - Added `GATEWAY_URL=https://chat.gatrion.my.id`
   - Added `GATEWAY_AUTH_KEY`

4. **package.json**
   - Changed main entry point: `src/server.js` → `src/main.js`
   - Updated npm scripts to use `src/main.js`

### Unchanged Files (No Changes Needed)
- `src/claude/*` (SessionManager, DirectClaudeSpawner, ClaudeStreamHandler)
- `src/database/session-db.js` (only added one method)
- `src/tools/executor.js`
- `src/commands/*` (parser.js, session-commands.js)
- `src/whatsapp/message-handler.js` (already event-based, no socket.io calls)

## Gateway Protocol

### Incoming Events (from Gateway)
```javascript
// Gateway emits to room: session-${sessionId}
socket.on('whatsapp:message', {
  from: phoneNumber,        // WhatsApp phone number
  message: messageText,     // Message content
  sessionId: sessionId,     // Session ID
  timestamp: Date.now()
});
```

### Outgoing Events (to Gateway)
```javascript
// CodeBridge emits back to Gateway
socket.emit('codebridge:response', {
  sessionId: sessionId,
  response: responseText,
  timestamp: Date.now()
});
```

### Room System
- Gateway menggunakan room system: `session-${sessionId}`
- CodeBridge auto join room saat session created
- CodeBridge auto leave room saat session closed
- Re-join semua active rooms after reconnect

## Flow Diagram

```
1. User sends WhatsApp message
   ↓
2. Gateway receives message
   ↓
3. Gateway emits to room: session-${sessionId}
   socket.to(`session-${sessionId}`).emit('whatsapp:message', {...})
   ↓
4. CodeBridge GatewayClient receives event (already joined room)
   ↓
5. GatewayClient routes to MessageHandler
   ↓
6. MessageHandler processes:
   - If command: route to SessionCommands
   - If prompt: route to SessionManager → DirectClaudeSpawner → Claude
   ↓
7. Response aggregated via events
   ↓
8. GatewayClient sends back:
   socket.emit('codebridge:response', {...})
   ↓
9. Gateway forwards to WhatsApp
   ↓
10. User receives response
```

## Environment Variables

```env
# Gateway Client Configuration
GATEWAY_URL=https://chat.gatrion.my.id
GATEWAY_AUTH_KEY=codebridge-secret-key-change-in-production

# Phase 5: Session & Project Configuration
PROJECT_ROOT_PATH=D:/working/gatrion
SESSION_DB_PATH=./.codebridge/sessions.db

# Kreova Configuration
ANTHROPIC_API_KEY=kv-...
ANTHROPIC_BASE_URL=http://127.0.0.1:3847/
CLAUDE_MODEL=kiro-claude-sonnet-4.5

# Session Limits
MAX_CONCURRENT_SESSIONS=50
MAX_HISTORY_LENGTH=20
REQUEST_TIMEOUT=30000

# Logging
LOG_LEVEL=info
DEBUG=false

# Rate Limiting (legacy - not used in client mode)
# RATE_LIMIT_MAX_REQUESTS=10
# RATE_LIMIT_WINDOW_MS=60000
```

## Running CodeBridge

### Start
```bash
npm start
# or
npm run dev  # with auto-restart
```

### What Happens on Start
1. Initialize SessionManager (load from SQLite)
2. Initialize MessageHandler
3. Initialize GatewayClient
4. Connect to Gateway Server (https://chat.gatrion.my.id)
5. Initialize SessionRoomManager
6. Join rooms for all active sessions
7. Setup event listeners for whatsapp:message
8. Start periodic cleanup tasks
9. Ready to receive messages

### Graceful Shutdown (Ctrl+C)
1. Stop accepting new messages
2. Cleanup session rooms (leave all rooms)
3. Disconnect from Gateway
4. Shutdown SessionManager (close all Claude sessions)
5. Close database connections
6. Exit

## Session Room Management

### Auto Join Room
```javascript
// When session is created
SessionManager.emit('session-created', { sessionId, userId })
  ↓
SessionRoomManager.onSessionCreated(sessionId, userId)
  ↓
GatewayClient.joinRoom(sessionId)  // Join: session-${sessionId}
```

### Auto Leave Room
```javascript
// When session is closed
SessionManager.emit('session-closed', { sessionId, userId })
  ↓
SessionRoomManager.onSessionClosed(sessionId)
  ↓
GatewayClient.leaveRoom(sessionId)  // Leave: session-${sessionId}
```

### Reconnect Handling
```javascript
// After Gateway reconnect
GatewayClient emits 'reconnect'
  ↓
GatewayClient._rejoinAllRooms()  // Re-join all active rooms
SessionRoomManager.onGatewayReconnected()
```

## Testing Checklist

### Phase 1: Basic Connection ✅
- [x] CodeBridge connects to Gateway
- [x] Connection logs show success
- [x] Socket ID assigned

### Phase 2: Room Management
- [ ] Create new session → auto join room
- [ ] Close session → auto leave room
- [ ] Check active rooms list

### Phase 3: Message Flow
- [ ] Send WhatsApp message
- [ ] Gateway emits whatsapp:message
- [ ] CodeBridge receives event
- [ ] Routes to MessageHandler
- [ ] Processes command/prompt
- [ ] Sends response back

### Phase 4: Session Commands
- [ ] /newsession creates session and joins room
- [ ] /project selects project
- [ ] /sessions lists sessions
- [ ] /closesession closes and leaves room

### Phase 5: Claude Integration
- [ ] Send prompt to Claude
- [ ] Receive streaming response
- [ ] Tool execution works
- [ ] Response sent back to Gateway

### Phase 6: Reconnection
- [ ] Disconnect Gateway
- [ ] CodeBridge auto-reconnects
- [ ] Re-joins all active rooms
- [ ] Messages flow again

### Phase 7: Graceful Shutdown
- [ ] Ctrl+C triggers shutdown
- [ ] Leaves all rooms
- [ ] Disconnects cleanly
- [ ] No hanging processes

## Troubleshooting

### Connection Issues
```bash
# Check Gateway is running
curl https://chat.gatrion.my.id

# Check logs
tail -f logs/codebridge.log

# Verify .env
cat .env | grep GATEWAY_URL
```

### Room Not Joined
```bash
# Check active rooms
# In CodeBridge logs: "Active rooms: []"

# Manual rejoin
sessionRoomManager.rejoinRoom(sessionId)
```

### Messages Not Received
1. Check Gateway is emitting to correct room: `session-${sessionId}`
2. Check CodeBridge has joined room
3. Check whatsapp:message event listener is setup
4. Check logs for errors

### Response Not Sent
1. Check GatewayClient is connected
2. Check response format: `{ sessionId, response, timestamp }`
3. Check emit event name: `codebridge:response`
4. Check logs for emit confirmation

## Next Steps

### Phase 4: MessageHandler Update (if needed)
- Review MessageHandler for any Socket.IO server calls
- Ensure all responses go through GatewayClient.sendResponse()
- No direct socket.emit() or io.to() calls

### Testing
1. Start Gateway Server (https://chat.gatrion.my.id)
2. Start CodeBridge Client
3. Send WhatsApp message
4. Verify response received
5. Test all commands
6. Test reconnection
7. Test graceful shutdown

### Production Deployment
1. Update .env with production Gateway URL
2. Update GATEWAY_AUTH_KEY
3. Test connection
4. Monitor logs
5. Setup PM2 for auto-restart
6. Setup monitoring/alerting

## Dependencies

### Existing (No Changes)
- `socket.io-client@^4.8.3` ✅ (already installed)
- All other dependencies remain unchanged

### Gateway Server (External - No Changes)
- Location: `D:/working/gatrion/whatsapp/`
- URL: `https://chat.gatrion.my.id`
- DO NOT modify Gateway code

## Notes

- Gateway Server code should NOT be changed
- CodeBridge is now a pure client
- All server logic has been archived
- Room management is automatic
- Reconnection is handled automatically
- Event-driven architecture maintained
- No breaking changes to SessionManager/MessageHandler APIs

## Status

✅ Phase 1: Archive old server files - COMPLETED
✅ Phase 2: Create new Gateway Client - COMPLETED
✅ Phase 3: Update entry point - COMPLETED
✅ Phase 4: Update SessionManager events - COMPLETED
⏳ Phase 5: Testing - PENDING

## Conclusion

CodeBridge telah berhasil diubah dari Socket.IO Server menjadi Socket.IO Client yang connect ke Gateway Server eksternal. Semua komponen core (SessionManager, MessageHandler, Commands) tetap tidak berubah, hanya layer komunikasi yang diganti dari server mode ke client mode.
