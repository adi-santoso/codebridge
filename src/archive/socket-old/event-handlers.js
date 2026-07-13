/**
 * Event Handlers - Phase 5
 *
 * Routes Socket.IO events to MessageHandler for Phase 5 architecture
 *
 * Changes from Phase 0-4:
 * - Routes to MessageHandler instead of SessionManager directly
 * - Handles both commands and prompts
 * - Uses userId from external WhatsApp gateway instead of sessionId
 * - Simplified event model (only codebridge:message event for both commands and prompts)
 */

import { Logger } from '../utils/logger.js';
import { socketConfig } from '../config/socket-config.js';

export class EventHandlers {
  /**
   * Create EventHandlers instance
   * @param {MessageHandler} messageHandler
   * @param {ConnectionManager} connectionManager
   */
  constructor(messageHandler, connectionManager) {
    this.messageHandler = messageHandler;
    this.connectionManager = connectionManager;
    this.logger = new Logger('EventHandlers');
  }

  /**
   * Register all event handlers for a socket
   */
  register(socket) {
    const clientId = socket.id;

    // Health check
    socket.on('codebridge:health', () => this.handleHealthCheck(socket));

    // Message processing (unified for commands and prompts)
    socket.on('codebridge:message', (data) => this.handleMessage(socket, data));

    // Error handling
    socket.on('error', (error) => {
      this.logger.error(`Socket error from ${clientId}:`, error);
    });

    this.logger.debug(`Event handlers registered for client: ${clientId}`);
  }

  /**
   * Handle health check
   */
  async handleHealthCheck(socket) {
    const clientId = socket.id;

    try {
      // Check authentication
      if (!this.connectionManager.isAuthenticated(clientId)) {
        socket.emit('codebridge:error', {
          code: 'NOT_AUTHENTICATED',
          message: 'Client not authenticated'
        });
        return;
      }

      socket.emit('codebridge:health', {
        status: 'ok',
        timestamp: Date.now(),
        connections: this.connectionManager.getConnectionCount(),
        pendingRequests: this.messageHandler.getPendingRequestCount()
      });

      this.logger.debug(`Health check from client: ${clientId}`);
    } catch (error) {
      this.logger.error(`Health check failed for ${clientId}:`, error);
      socket.emit('codebridge:error', {
        code: 'HEALTH_CHECK_FAILED',
        message: error.message
      });
    }
  }

  /**
   * Handle incoming message (commands or prompts)
   *
   * Expected payload:
   * {
   *   userId: '628xxx',        // WhatsApp phone number
   *   message: 'create file', // User message (command or prompt)
   *   requestId: 'optional'    // Optional request ID
   * }
   */
  async handleMessage(socket, data) {
    const clientId = socket.id;
    const startTime = Date.now();

    // Use client's requestId if provided, otherwise generate one
    const requestId = data?.requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      // Validate authentication
      if (!this.connectionManager.isAuthenticated(clientId)) {
        socket.emit('codebridge:error', {
          requestId,
          code: 'NOT_AUTHENTICATED',
          message: 'Client not authenticated'
        });
        return;
      }

      // Check rate limit
      if (!this.connectionManager.checkRateLimit(clientId)) {
        socket.emit('codebridge:error', {
          requestId,
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.'
        });
        return;
      }

      // Validate payload
      const { userId, message } = data || {};

      if (!userId || !message) {
        socket.emit('codebridge:error', {
          requestId,
          code: 'INVALID_PAYLOAD',
          message: 'Missing required fields: userId and message'
        });
        return;
      }

      this.logger.info(`Message received from ${clientId} (user: ${userId})`, {
        messagePreview: message.substring(0, 50),
        requestId
      });

      // Process with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), socketConfig.requestTimeout);
      });

      // Route to MessageHandler
      const responsePromise = this.messageHandler.handleMessage({
        userId,
        message,
        requestId
      });

      const result = await Promise.race([responsePromise, timeoutPromise]);

      const duration = Date.now() - startTime;

      // Send response
      socket.emit('codebridge:response', {
        requestId,
        userId,
        response: result.response,
        timestamp: Date.now(),
        duration,
        metadata: {
          isCommand: result.isCommand || false,
          isError: result.isError || false,
          sessionId: result.sessionId || null,
          toolResults: result.toolResults || [],
          stopReason: result.stopReason || null
        }
      });

      this.logger.info(`Message processed for user ${userId}`, {
        requestId,
        duration: `${duration}ms`,
        responseLength: result.response.length,
        isCommand: result.isCommand,
        isError: result.isError
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Message processing failed for ${clientId}:`, error);

      socket.emit('codebridge:error', {
        requestId,
        code: error.message.includes('timeout') ? 'TIMEOUT' : 'PROCESSING_ERROR',
        message: error.message,
        duration
      });
    }
  }
}

export default EventHandlers;
