/**
 * Gateway Client - Socket.IO Client untuk koneksi ke Gateway Server
 *
 * Responsibilities:
 * - Connect ke Gateway Socket.IO Server
 * - Handle reconnection otomatis
 * - Join/leave session rooms
 * - Listen untuk whatsapp:message events
 * - Emit codebridge:response back ke Gateway
 *
 * Gateway Protocol:
 * - Incoming: socket.on('whatsapp:message', { from, message, sessionId, timestamp })
 * - Outgoing: socket.emit('codebridge:response', { sessionId, response, timestamp })
 */

import { io } from 'socket.io-client';
import { Logger } from './utils/logger.js';

class GatewayClient {
  constructor(config = {}) {
    this.gatewayUrl = config.gatewayUrl || process.env.GATEWAY_URL || 'https://chat.gatrion.my.id';
    this.authKey = config.authKey || process.env.GATEWAY_AUTH_KEY || 'codebridge-secret-key';
    this.socket = null;
    this.isConnected = false;
    this.activeRooms = new Set(); // Track active session rooms
    this.logger = new Logger('GatewayClient');
    this.eventHandlers = new Map(); // Event name -> handler function
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;

    this.logger.info('Initialized', {
      gatewayUrl: this.gatewayUrl
    });
  }

  /**
   * Connect ke Gateway Server
   */
  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.logger.info('[GatewayClient] Connecting to Gateway...', {
          url: this.gatewayUrl
        });

        this.socket = io(this.gatewayUrl, {
          auth: {
            key: this.authKey,
            clientType: 'codebridge'
          },
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: this.maxReconnectAttempts,
          timeout: 20000,
          transports: ['websocket', 'polling']
        });

        // Connection success
        this.socket.on('connect', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.logger.info('[GatewayClient] Connected to Gateway', {
            socketId: this.socket.id
          });

          // Re-join all active rooms after reconnect
          this._rejoinAllRooms();

          resolve(this.socket.id);
        });

        // Connection error
        this.socket.on('connect_error', (error) => {
          this.reconnectAttempts++;
          this.logger.error('[GatewayClient] Connection error', {
            error: error.message,
            attempt: this.reconnectAttempts
          });

          if (this.reconnectAttempts === 1) {
            reject(error); // Reject only on first attempt
          }
        });

        // Disconnection
        this.socket.on('disconnect', (reason) => {
          this.isConnected = false;
          this.logger.warn('[GatewayClient] Disconnected from Gateway', {
            reason
          });
        });

        // Reconnection attempt
        this.socket.on('reconnect_attempt', (attemptNumber) => {
          this.logger.info('[GatewayClient] Reconnection attempt', {
            attempt: attemptNumber
          });
        });

        // Reconnection success
        this.socket.on('reconnect', (attemptNumber) => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.logger.info('[GatewayClient] Reconnected to Gateway', {
            afterAttempts: attemptNumber
          });
        });

        // Reconnection failed
        this.socket.on('reconnect_failed', () => {
          this.logger.error('[GatewayClient] Reconnection failed after max attempts');
        });

        // Setup default event listeners
        this._setupDefaultListeners();

      } catch (error) {
        this.logger.error('[GatewayClient] Failed to initialize connection', {
          error: error.message
        });
        reject(error);
      }
    });
  }

  /**
   * Setup default Gateway event listeners
   */
  _setupDefaultListeners() {
    // Listen for whatsapp:message from Gateway
    this.socket.on('whatsapp:message', (data) => {
      this.logger.info('[GatewayClient] Received whatsapp:message', {
        from: data.from,
        sessionId: data.sessionId,
        messagePreview: data.message.substring(0, 50)
      });

      // Trigger registered handler
      const handler = this.eventHandlers.get('whatsapp:message');
      if (handler) {
        handler(data);
      } else {
        this.logger.warn('[GatewayClient] No handler registered for whatsapp:message');
      }
    });

    // Listen for room join confirmations
    this.socket.on('joined-session', (data) => {
      this.logger.info('[GatewayClient] Room joined confirmed', data);
    });

    // Listen for room leave confirmations (if Gateway adds this)
    this.socket.on('left-session', (data) => {
      this.logger.info('[GatewayClient] Room left confirmed', data);
    });

    // Listen for errors from Gateway
    this.socket.on('error', (error) => {
      this.logger.error('[GatewayClient] Gateway error', { error });
    });
  }

  /**
   * Register event handler
   * @param {string} eventName - Event name (e.g., 'whatsapp:message')
   * @param {Function} handler - Handler function
   */
  on(eventName, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }
    this.eventHandlers.set(eventName, handler);
    this.logger.debug('[GatewayClient] Event handler registered', { eventName });
  }

  /**
   * Join session room
   * @param {string} sessionId - Session ID (with or without 'session-' prefix)
   */
  joinRoom(sessionId) {
    if (!this.socket || !this.isConnected) {
      this.logger.warn('[GatewayClient] Cannot join room - not connected');
      return false;
    }

    // Strip 'session-' prefix if already present
    const cleanSessionId = sessionId.startsWith('session-')
      ? sessionId.substring(8)
      : sessionId;

    const roomName = `session-${cleanSessionId}`;
    this.socket.emit('join-session', cleanSessionId); // Send clean ID to Gateway
    this.activeRooms.add(cleanSessionId);

    this.logger.info('[GatewayClient] Joining room', {
      sessionId: cleanSessionId,
      roomName
    });

    return true;
  }

  /**
   * Leave session room
   * @param {string} sessionId - Session ID (with or without 'session-' prefix)
   */
  leaveRoom(sessionId) {
    if (!this.socket || !this.isConnected) {
      this.logger.warn('[GatewayClient] Cannot leave room - not connected');
      return false;
    }

    // Strip 'session-' prefix if already present
    const cleanSessionId = sessionId.startsWith('session-')
      ? sessionId.substring(8)
      : sessionId;

    const roomName = `session-${cleanSessionId}`;
    this.socket.emit('leave-session', cleanSessionId); // Send clean ID to Gateway
    this.activeRooms.delete(cleanSessionId);

    this.logger.info('[GatewayClient] Leaving room', {
      sessionId: cleanSessionId,
      roomName
    });

    return true;
  }

  /**
   * Re-join all active rooms (after reconnect)
   */
  _rejoinAllRooms() {
    if (this.activeRooms.size === 0) {
      return;
    }

    this.logger.info('[GatewayClient] Re-joining active rooms', {
      count: this.activeRooms.size,
      rooms: Array.from(this.activeRooms)
    });

    this.activeRooms.forEach(sessionId => {
      this.joinRoom(sessionId);
    });
  }

  /**
   * Send response back to Gateway
   * @param {Object} data - Response data
   * @param {string} data.sessionId - Session ID
   * @param {string} data.to - Phone number to send to
   * @param {string} data.message - Message text to send
   * @param {number} [data.timestamp] - Optional timestamp
   */
  sendResponse(data) {
    if (!this.socket || !this.isConnected) {
      this.logger.error('[GatewayClient] Cannot send response - not connected', {
        sessionId: data.sessionId
      });
      return false;
    }

    // Ensure required fields
    if (!data.sessionId || !data.to || !data.message) {
      this.logger.error('[GatewayClient] Invalid response data - missing sessionId, to, or message', { data });
      return false;
    }

    const payload = {
      sessionId: data.sessionId,
      to: data.to,
      message: data.message,
      timestamp: data.timestamp || Date.now()
    };

    this.socket.emit('send:message', payload);

    this.logger.info('[GatewayClient] Response sent', {
      sessionId: payload.sessionId,
      to: payload.to,
      messageLength: payload.message.length
    });

    return true;
  }

  /**
   * Get active rooms
   */
  getActiveRooms() {
    return Array.from(this.activeRooms);
  }

  /**
   * Check if connected
   */
  isSocketConnected() {
    return this.isConnected && this.socket && this.socket.connected;
  }

  /**
   * Disconnect from Gateway
   */
  disconnect() {
    if (this.socket) {
      this.logger.info('[GatewayClient] Disconnecting from Gateway...');
      this.socket.disconnect();
      this.isConnected = false;
      this.activeRooms.clear();
      this.socket = null;
    }
  }
}

export default GatewayClient;
