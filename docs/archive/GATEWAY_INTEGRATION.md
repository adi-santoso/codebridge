# WhatsApp Gateway Integration Guide

## Architecture Overview

```
WhatsApp User → WhatsApp Gateway (https://chat.gatrion.my.id) → CodeBridge (localhost:3848) → Claude CLI
                (D:/working/gatrion/whatsapp)                    (D:/working/gatrion/codebridge)
```

## Prerequisites

✅ **WhatsApp Gateway** - Already running at `https://chat.gatrion.my.id`
✅ **CodeBridge** - Ready to start (Phase 5 complete)

## Integration Steps

### 1. Start CodeBridge Server

```bash
cd D:/working/gatrion/codebridge
node src/server.js
```

Server akan jalan di `http://localhost:3848`

**Expected output:**
```
🚀 CodeBridge server running on port 3848
Socket.IO endpoint: http://localhost:3848
Health check: http://localhost:3848/health
Session DB: ./.codebridge/sessions.db
Project root: D:/working/gatrion
```

---

### 2. Add CodeBridge Client to WhatsApp Gateway

Buat file baru di WhatsApp Gateway:

**File: `D:/working/gatrion/whatsapp/src/services/codebridge-client.js`**

```javascript
import { io } from 'socket.io-client';
import { Logger } from '../utils/logger.js';

const logger = new Logger('CodeBridgeClient');

export class CodeBridgeClient {
  constructor(options) {
    this.url = options.url || 'http://localhost:3848';
    this.authKey = options.authKey;
    this.socket = null;
    this.connected = false;
    this.messageHandler = options.messageHandler; // Callback untuk responses
  }

  /**
   * Connect to CodeBridge
   */
  connect() {
    logger.info(`Connecting to CodeBridge at ${this.url}...`);

    this.socket = io(this.url, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });

    // Connection established
    this.socket.on('connect', () => {
      logger.info('Connected to CodeBridge, authenticating...');
      
      this.socket.emit('authenticate', {
        authKey: this.authKey,
        metadata: {
          gateway: 'whatsapp-gateway',
          version: '1.0.0'
        }
      });
    });

    // Authentication success
    this.socket.on('authenticated', () => {
      this.connected = true;
      logger.success('✅ Authenticated with CodeBridge');
    });

    // Authentication failed
    this.socket.on('auth_failed', (data) => {
      logger.error('❌ CodeBridge authentication failed:', data);
      this.connected = false;
    });

    // Response from CodeBridge (coding response)
    this.socket.on('codebridge:response', (data) => {
      logger.info('Response received from CodeBridge', {
        userId: data.userId,
        responseLength: data.response.length,
        isCommand: data.metadata?.isCommand,
        isError: data.metadata?.isError
      });

      // Call message handler to send back to WhatsApp
      if (this.messageHandler) {
        this.messageHandler(data);
      }
    });

    // Error from CodeBridge
    this.socket.on('codebridge:error', (data) => {
      logger.error('CodeBridge error:', data);
      
      if (this.messageHandler) {
        this.messageHandler({
          userId: data.userId || null,
          response: `❌ Error: ${data.message}`,
          metadata: { isError: true }
        });
      }
    });

    // Disconnect
    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      logger.warn(`Disconnected from CodeBridge: ${reason}`);
    });

    // Reconnect
    this.socket.on('reconnect', (attemptNumber) => {
      logger.info(`Reconnected to CodeBridge (attempt ${attemptNumber})`);
    });
  }

  /**
   * Send message to CodeBridge for coding task
   * @param {string} userId - WhatsApp phone number (628xxx)
   * @param {string} message - User's message
   * @param {string} requestId - Optional request ID
   */
  sendMessage(userId, message, requestId = null) {
    if (!this.connected) {
      logger.error('Cannot send message - not connected to CodeBridge');
      return false;
    }

    const payload = {
      userId,
      message,
      requestId: requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    };

    logger.info('Sending message to CodeBridge', {
      userId,
      messagePreview: message.substring(0, 50),
      requestId: payload.requestId
    });

    this.socket.emit('codebridge:message', payload);
    return true;
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected && this.socket?.connected;
  }

  /**
   * Disconnect from CodeBridge
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.connected = false;
      logger.info('Disconnected from CodeBridge');
    }
  }
}
```

---

### 3. Integrate with WhatsApp Message Handler

**File: `D:/working/gatrion/whatsapp/src/handlers/codebridge-handler.js`**

```javascript
import { CodeBridgeClient } from '../services/codebridge-client.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('CodeBridgeHandler');

export class CodeBridgeHandler {
  constructor(whatsappClient) {
    this.whatsappClient = whatsappClient;
    this.codeBridgeClient = null;
    this.activeUsers = new Set(); // Users yang sedang coding
  }

  /**
   * Initialize CodeBridge connection
   */
  async initialize() {
    logger.info('Initializing CodeBridge handler...');

    // Create CodeBridge client
    this.codeBridgeClient = new CodeBridgeClient({
      url: process.env.CODEBRIDGE_URL || 'http://localhost:3848',
      authKey: process.env.CODEBRIDGE_AUTH_KEY,
      messageHandler: (data) => this.handleCodeBridgeResponse(data)
    });

    // Connect
    this.codeBridgeClient.connect();

    logger.success('CodeBridge handler initialized');
  }

  /**
   * Check if message should go to CodeBridge
   */
  shouldHandleMessage(message) {
    const userId = message.from;
    
    // User sedang dalam coding session
    if (this.activeUsers.has(userId)) {
      return true;
    }

    // Message starts with /code or coding keyword
    const text = message.body?.toLowerCase() || '';
    if (text.startsWith('/code') || text.startsWith('/coding')) {
      this.activeUsers.add(userId);
      return true;
    }

    return false;
  }

  /**
   * Send message to CodeBridge
   */
  async handleMessage(sessionId, message) {
    const userId = message.from; // 628xxx@s.whatsapp.net
    const userPhone = userId.split('@')[0]; // 628xxx
    const text = message.body;

    logger.info('Forwarding to CodeBridge', {
      sessionId,
      userId: userPhone,
      messagePreview: text.substring(0, 50)
    });

    // Send to CodeBridge
    const sent = this.codeBridgeClient.sendMessage(userPhone, text);

    if (!sent) {
      // CodeBridge not connected
      await this.whatsappClient.sendMessage(sessionId, userId, {
        text: '❌ CodeBridge not connected. Please try again later.'
      });
    }
  }

  /**
   * Handle response from CodeBridge and send back to WhatsApp
   */
  async handleCodeBridgeResponse(data) {
    const { userId, response, metadata } = data;
    const whatsappJid = `${userId}@s.whatsapp.net`;

    logger.info('Sending CodeBridge response to WhatsApp', {
      userId,
      responseLength: response.length,
      isCommand: metadata?.isCommand,
      isError: metadata?.isError
    });

    try {
      // Get session for this user (assume first session)
      const sessions = await this.whatsappClient.getSessions();
      const sessionId = sessions[0]?.sessionId;

      if (!sessionId) {
        logger.error('No WhatsApp session available');
        return;
      }

      // Send response to WhatsApp
      await this.whatsappClient.sendMessage(sessionId, whatsappJid, {
        text: response
      });

      logger.success('Response sent to WhatsApp user', { userId });

    } catch (error) {
      logger.error('Failed to send CodeBridge response to WhatsApp:', error);
    }
  }

  /**
   * Stop coding session for user
   */
  stopCodingSession(userId) {
    this.activeUsers.delete(userId);
    logger.info('Coding session stopped', { userId });
  }

  /**
   * Shutdown
   */
  shutdown() {
    if (this.codeBridgeClient) {
      this.codeBridgeClient.disconnect();
    }
    this.activeUsers.clear();
  }
}
```

---

### 4. Update WhatsApp Gateway Main Handler

**File: `D:/working/gatrion/whatsapp/src/handlers/message-handler.js` (add to existing)**

```javascript
import { CodeBridgeHandler } from './codebridge-handler.js';

// In your existing MessageHandler class:
export class MessageHandler {
  constructor(whatsappClient) {
    this.whatsappClient = whatsappClient;
    this.codeBridgeHandler = new CodeBridgeHandler(whatsappClient);
  }

  async initialize() {
    // Initialize CodeBridge handler
    await this.codeBridgeHandler.initialize();
  }

  async handleIncomingMessage(sessionId, message) {
    // Check if message should go to CodeBridge
    if (this.codeBridgeHandler.shouldHandleMessage(message)) {
      await this.codeBridgeHandler.handleMessage(sessionId, message);
      return; // Don't process further
    }

    // ... your existing message handling logic ...
  }

  shutdown() {
    this.codeBridgeHandler.shutdown();
  }
}
```

---

### 5. Environment Variables

**File: `D:/working/gatrion/whatsapp/.env` (add to existing)**

```env
# CodeBridge Integration
CODEBRIDGE_URL=http://localhost:3848
CODEBRIDGE_AUTH_KEY=codebridge-secret-key-change-in-production
```

---

## Usage Flow

### User Workflow

1. **Start Coding Session**
   ```
   User → WhatsApp: /code
   Gateway → User: "Coding mode activated. Send your coding requests."
   ```

2. **Create Session**
   ```
   User → WhatsApp: /newsession
   CodeBridge → User: "✅ New session created: sess_abc123"
   ```

3. **Select Project**
   ```
   User → WhatsApp: /projects
   CodeBridge → User: "📁 Available projects (3): codebridge, whatsapp, myapp"
   
   User → WhatsApp: /project codebridge
   CodeBridge → User: "✅ Project selected: codebridge"
   ```

4. **Send Coding Prompts**
   ```
   User → WhatsApp: "create a hello.js file with console.log"
   CodeBridge → Claude → Tool Execution
   CodeBridge → User: "Created hello.js with console.log('Hello World')"
   ```

5. **Exit Coding Mode**
   ```
   User → WhatsApp: /stop
   Gateway → User: "Coding mode deactivated"
   ```

---

## Testing

### 1. Test CodeBridge Server
```bash
# Terminal 1: Start CodeBridge
cd D:/working/gatrion/codebridge
node src/server.js

# Terminal 2: Check health
curl http://localhost:3848/health
```

**Expected response:**
```json
{
  "status": "ok",
  "timestamp": 1234567890,
  "connections": 0
}
```

### 2. Test WhatsApp Gateway Connection
```bash
# Terminal 1: Keep CodeBridge running
# Terminal 2: Restart WhatsApp Gateway
cd D:/working/gatrion/whatsapp
npm start
```

**Expected logs:**
```
[CodeBridgeClient] Connecting to CodeBridge at http://localhost:3848...
[CodeBridgeClient] Connected to CodeBridge, authenticating...
[CodeBridgeClient] ✅ Authenticated with CodeBridge
```

### 3. Test End-to-End via WhatsApp

Send via WhatsApp:
```
/code
/newsession
/projects
/project codebridge
list files in current directory
```

---

## Troubleshooting

### CodeBridge Not Connected
**Symptom:** WhatsApp gateway shows "CodeBridge not connected"

**Solution:**
1. Check CodeBridge is running: `curl http://localhost:3848/health`
2. Check auth key matches in both `.env` files
3. Check firewall allows localhost:3848

### Authentication Failed
**Symptom:** Gateway logs show "CodeBridge authentication failed"

**Solution:**
1. Verify `CODEBRIDGE_AUTH_KEY` same di kedua `.env`
2. Check `SOCKET_AUTH_KEY` di CodeBridge `.env`
3. Restart both servers

### Response Timeout
**Symptom:** User tidak menerima response dari CodeBridge

**Solution:**
1. Check Claude CLI installed: `claude --version`
2. Check PROJECT_ROOT_PATH valid di CodeBridge `.env`
3. Check user sudah `/project` select project
4. Check logs di CodeBridge: errors dari Claude?

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          WhatsApp User                          │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                │ WhatsApp Protocol
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│     WhatsApp Gateway (https://chat.gatrion.my.id)              │
│     - Baileys client                                            │
│     - Message routing                                           │
│     - CodeBridgeHandler                                         │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                │ Socket.IO (codebridge:message)
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│     CodeBridge Server (localhost:3848)                         │
│     - Socket.IO server                                          │
│     - MessageHandler                                            │
│     - SessionManager                                            │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                │ DirectClaudeSpawner
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│     Claude Code CLI (subprocess)                                │
│     - Tool execution (Bash, Read, Write, Edit)                  │
│     - Context management                                         │
│     - Custom endpoint (kreova)                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Next Steps

After integration complete:

1. **Test dengan real user** via WhatsApp
2. **Monitor logs** di kedua server
3. **Add error handling** untuk edge cases
4. **Add rate limiting** per user jika perlu
5. **Add metrics** untuk usage tracking

---

## Support

For issues:
- CodeBridge issues: Check `D:/working/gatrion/codebridge/docs/phase5-complete.md`
- Gateway issues: Check `D:/working/gatrion/whatsapp/README.md`
- Integration issues: Check logs di kedua server
