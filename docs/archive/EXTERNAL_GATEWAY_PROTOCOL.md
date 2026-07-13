# External WhatsApp Gateway Integration Protocol

**Purpose:** This document describes the Socket.IO protocol between your external WhatsApp Gateway project and CodeBridge.

**Last Updated:** 2026-07-10

---

## Overview

CodeBridge does NOT run Baileys/whatsapp-web.js internally. Instead, it provides a Socket.IO server that receives messages from your external WhatsApp Gateway project.

**Architecture:**
```
Your WhatsApp Gateway Project → Socket.IO → CodeBridge → Claude CLI
(Baileys/whatsapp-web.js)         (PORT 3000)
```

---

## Connection & Authentication

### 1. Connect to CodeBridge

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000'); // CodeBridge Socket.IO server

socket.on('connect', () => {
  console.log('Connected to CodeBridge:', socket.id);
});
```

### 2. Authenticate

After connection, you MUST authenticate within 5 seconds:

```javascript
socket.on('connect', () => {
  socket.emit('authenticate', {
    authKey: process.env.CODEBRIDGE_AUTH_KEY, // From CodeBridge .env
    metadata: {
      gateway: 'my-whatsapp-gateway',
      version: '1.0.0'
    }
  });
});

// Success
socket.on('auth:success', (data) => {
  console.log('Authenticated:', data.clientId);
  // data = { clientId: 'socket-id', serverTime: 1234567890 }
});

// Error
socket.on('auth:error', (error) => {
  console.error('Auth failed:', error.message);
  // error = { code: 'INVALID_AUTH_KEY', message: '...' }
});
```

**Important:** If you don't authenticate within 5 seconds, the connection will be closed.

---

## Sending Messages to CodeBridge

### Event: `codebridge:message`

Forward WhatsApp messages to CodeBridge:

```javascript
whatsappClient.on('message', async (msg) => {
  // Forward to CodeBridge
  socket.emit('codebridge:message', {
    requestId: `req_${Date.now()}`, // Optional: your own request ID for tracking
    sessionId: msg.from,             // WhatsApp phone number (e.g., '628xxx@c.us')
    message: msg.body,               // Message text
    metadata: {                      // Optional metadata
      messageId: msg.id,
      timestamp: msg.timestamp,
      chatName: msg.notifyName
    }
  });
});
```

**Parameters:**
- `requestId` (optional): Your own request ID for tracking. If omitted, CodeBridge generates one.
- `sessionId` (required): WhatsApp phone number (used as user identifier)
- `message` (required): Message text from WhatsApp user
- `metadata` (optional): Any additional metadata you want to track

---

## Receiving Responses from CodeBridge

### Event: `codebridge:response`

Listen for responses from Claude:

```javascript
socket.on('codebridge:response', (data) => {
  console.log('Response received:', data);
  
  // Send back to WhatsApp user
  whatsappClient.sendMessage(data.sessionId, data.response);
});
```

**Response Format:**
```javascript
{
  requestId: 'req_1234567890',     // Your request ID or generated one
  sessionId: '628xxx@c.us',        // Same sessionId from request
  response: 'Here are the files...', // Claude's response text
  timestamp: 1234567890,           // Response timestamp
  duration: 2345,                  // Processing time in milliseconds
  metadata: {
    conversationLength: 5,         // Number of turns in conversation
    responseTime: 2345,            // Time to generate response (ms)
    model: 'kiro-claude-sonnet-4.5', // Model used
    usage: {
      input_tokens: 150,
      output_tokens: 85
    }
  }
}
```

---

## Error Handling

### Event: `codebridge:error`

Listen for errors:

```javascript
socket.on('codebridge:error', (error) => {
  console.error('CodeBridge error:', error);
  
  // Send error message to WhatsApp user
  whatsappClient.sendMessage(error.sessionId, `❌ Error: ${error.message}`);
});
```

**Error Format:**
```javascript
{
  requestId: 'req_1234567890',
  code: 'PROCESSING_ERROR',       // Error code
  message: 'Tool execution failed', // Human-readable message
  duration: 1234                  // Time before error occurred
}
```

**Common Error Codes:**
- `NOT_AUTHENTICATED` - Client not authenticated
- `INVALID_PAYLOAD` - Missing required fields (sessionId or message)
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `TIMEOUT` - Request took too long
- `PROCESSING_ERROR` - Error during message processing

---

## Other Events

### Health Check

Check if CodeBridge is alive:

```javascript
socket.emit('codebridge:health');

socket.on('codebridge:health', (data) => {
  console.log('CodeBridge health:', data);
  // data = {
  //   status: 'ok',
  //   timestamp: 1234567890,
  //   kreova: { status: 'ok', ... },
  //   connections: 3
  // }
});
```

### Clear Conversation

Reset conversation history for a user:

```javascript
socket.emit('codebridge:clear', {
  sessionId: '628xxx@c.us'
});

socket.on('codebridge:cleared', (data) => {
  console.log('Conversation cleared:', data.sessionId);
});
```

### Get Status

Get current status of a session:

```javascript
socket.emit('codebridge:status', {
  sessionId: '628xxx@c.us'
});

socket.on('codebridge:status', (data) => {
  console.log('Session status:', data);
  // data = { sessionId, status: { ... }, timestamp }
});
```

---

## Complete Integration Example

```javascript
import { io } from 'socket.io-client';
import { Client } from 'whatsapp-web.js'; // Or Baileys

// 1. Setup WhatsApp Client
const whatsapp = new Client({
  puppeteer: { headless: true }
});

whatsapp.on('qr', (qr) => {
  console.log('QR Code:', qr);
});

whatsapp.on('ready', () => {
  console.log('WhatsApp ready!');
});

// 2. Setup CodeBridge Connection
const codebridge = io('http://localhost:3000');

codebridge.on('connect', () => {
  console.log('Connected to CodeBridge');
  
  // Authenticate
  codebridge.emit('authenticate', {
    authKey: process.env.CODEBRIDGE_AUTH_KEY,
    metadata: { gateway: 'my-gateway' }
  });
});

codebridge.on('auth:success', () => {
  console.log('Authenticated with CodeBridge');
});

// 3. Forward WhatsApp messages to CodeBridge
whatsapp.on('message', async (msg) => {
  if (msg.body.startsWith('!')) {
    // Ignore WhatsApp commands
    return;
  }
  
  console.log(`[${msg.from}] ${msg.body}`);
  
  codebridge.emit('codebridge:message', {
    sessionId: msg.from,
    message: msg.body,
    metadata: {
      messageId: msg.id,
      timestamp: msg.timestamp
    }
  });
});

// 4. Send CodeBridge responses back to WhatsApp
codebridge.on('codebridge:response', async (data) => {
  console.log(`[CodeBridge → ${data.sessionId}] ${data.response}`);
  
  await whatsapp.sendMessage(data.sessionId, data.response);
});

// 5. Handle errors
codebridge.on('codebridge:error', async (error) => {
  console.error('CodeBridge error:', error);
  
  if (error.sessionId) {
    await whatsapp.sendMessage(error.sessionId, `❌ Error: ${error.message}`);
  }
});

// 6. Start WhatsApp client
whatsapp.initialize();
```

---

## Configuration

### CodeBridge .env

```bash
# Socket.IO server port
PORT=3000

# Authentication key (share this with your gateway)
SOCKET_AUTH_KEY=your-secret-key-here

# Session database
SESSION_DB_PATH=./.codebridge/sessions.db

# Project root path
PROJECT_ROOT_PATH=/home/user/projects
```

### Your Gateway .env

```bash
# CodeBridge connection
CODEBRIDGE_URL=http://localhost:3000
CODEBRIDGE_AUTH_KEY=your-secret-key-here

# WhatsApp credentials (depends on your library)
WHATSAPP_SESSION_PATH=./wa-session
```

---

## Rate Limiting

CodeBridge has built-in rate limiting:
- **Default:** 100 requests per 60 seconds per client
- **Exceeded:** Returns `RATE_LIMIT_EXCEEDED` error
- **Configurable:** See `src/config/socket-config.js`

If you hit rate limits, implement request queuing in your gateway.

---

## Session Management (Phase 5)

When Phase 5 is complete, users will need to create sessions before sending prompts:

```javascript
// User: /newsession
codebridge.emit('codebridge:message', {
  sessionId: '628xxx@c.us',
  message: '/newsession'
});
// Response: "✅ New session created: sess_abc123"

// User: /projects
codebridge.emit('codebridge:message', {
  sessionId: '628xxx@c.us',
  message: '/projects'
});
// Response: List of projects from PROJECT_ROOT_PATH

// User: /project backend-api
codebridge.emit('codebridge:message', {
  sessionId: '628xxx@c.us',
  message: '/project backend-api'
});
// Response: "✅ Project selected: backend-api"

// Now user can send coding prompts
codebridge.emit('codebridge:message', {
  sessionId: '628xxx@c.us',
  message: 'List all controllers'
});
// Response: Claude's response about controllers in backend-api project
```

See `docs/phase5-plan.md` for complete session management documentation.

---

## Troubleshooting

### Connection Refused

**Problem:** Cannot connect to CodeBridge

**Solutions:**
- Check if CodeBridge is running: `node src/server.js`
- Check port: Default is 3000, configurable in `.env`
- Check firewall rules

### Authentication Timeout

**Problem:** Connection closed after 5 seconds

**Solution:**
- Emit `authenticate` event immediately after `connect`
- Check `SOCKET_AUTH_KEY` matches CodeBridge `.env`

### Rate Limit Exceeded

**Problem:** Getting `RATE_LIMIT_EXCEEDED` errors

**Solutions:**
- Implement request queuing in your gateway
- Increase rate limits in CodeBridge `socket-config.js`
- Check for infinite loops or repeated requests

### No Response

**Problem:** Sent `codebridge:message` but no response

**Solutions:**
- Check if you authenticated successfully
- Check sessionId format (should be WhatsApp phone number)
- Listen for `codebridge:error` events
- Check CodeBridge logs for errors

---

## Support

For issues or questions:
1. Check CodeBridge logs: `node src/server.js` output
2. Check your gateway logs
3. Enable debug mode in both projects
4. Create issue on GitHub

---

**Document Version:** 1.0 (Pre-Phase 5)  
**Last Updated:** 2026-07-10  
**Status:** Protocol Defined, Implementation Pending Phase 5
