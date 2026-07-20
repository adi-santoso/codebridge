/**
 * Message Handler - Phase 5
 *
 * Routes messages from Socket.IO to SessionManager
 *
 * Flow:
 * 1. Receive message from external WhatsApp gateway via Socket.IO
 * 2. Check if message is a command (/newsession, /projects, etc.)
 * 3. If command: Route to SessionCommands
 * 4. If prompt: Route to SessionManager → DirectClaudeSpawner
 * 5. Listen for 'response-ready' event from SessionManager
 * 6. Send response back via Socket.IO
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import { CommandParser } from '../commands/parser.js';
import { SessionCommands } from '../commands/session-commands.js';
import { CommandHandler } from '../commands/handler.js';

export class MessageHandler extends EventEmitter {
  /**
   * Create MessageHandler instance
   * @param {Object} options
   * @param {SessionManager} options.sessionManager
   * @param {string} [options.projectRootPath] - Root path for projects
   * @param {ProjectRegistry} [options.projectRegistry] - Project registry
   */
  constructor(options) {
    super(); // Initialize EventEmitter

    this.sessionManager = options.sessionManager;
    this.logger = new Logger('MessageHandler');

    // Get database instance from SessionManager
    this.db = this.sessionManager.db;

    // Session commands handler (deprecated - kept for backward compatibility)
    this.sessionCommands = new SessionCommands({
      sessionManager: this.sessionManager,
      projectRootPath: options.projectRootPath
    });

    // NEW: Command handler with middleware chain
    this.commandHandler = new CommandHandler({
      sessionManager: this.sessionManager,
      db: this.db,
      projectRootPath: options.projectRootPath,
      projectRegistry: options.projectRegistry,
      allowedNumbers: this.parseAllowedNumbers(process.env.ALLOWED_WHATSAPP_NUMBERS)
    });

    // Pending requests: requestId → { userId, resolve, reject, timestamp }
    this.pendingRequests = new Map();

    // Cache last gatewaySessionId per user for late responses
    this.lastGatewaySession = new Map();

    // Request timeout (120 seconds - Claude tools can take time)
    this.requestTimeout = 120000;

    // WhatsApp number whitelist
    this.allowedNumbers = this.parseAllowedNumbers(process.env.ALLOWED_WHATSAPP_NUMBERS);

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Parse allowed WhatsApp numbers from env
   * @private
   */
  parseAllowedNumbers(envValue) {
    if (!envValue || envValue.trim() === '') {
      this.logger.warn('No ALLOWED_WHATSAPP_NUMBERS configured - all numbers accepted (INSECURE)');
      return null; // null = allow all
    }

    const numbers = envValue
      .split(',')
      .map(n => n.trim())
      .filter(Boolean);

    this.logger.info(`WhatsApp whitelist enabled: ${numbers.length} number(s)`);
    return new Set(numbers);
  }

  /**
   * Check if WhatsApp number is allowed
   * @private
   */
  isNumberAllowed(userId) {
    // If no whitelist configured, allow all
    if (!this.allowedNumbers) {
      return true;
    }

    return this.allowedNumbers.has(userId);
  }

  /**
   * Split long message into chunks (WhatsApp limit: 4096 chars)
   * @private
   */
  splitMessage(message, maxLength = 4000) {
    if (message.length <= maxLength) {
      return [message];
    }

    const chunks = [];
    let remaining = message;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Find last newline before maxLength
      let splitIndex = remaining.lastIndexOf('\n', maxLength);

      // If no newline found, find last space
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        splitIndex = remaining.lastIndexOf(' ', maxLength);
      }

      // If still not found, force split at maxLength
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        splitIndex = maxLength;
      }

      chunks.push(remaining.substring(0, splitIndex));
      remaining = remaining.substring(splitIndex).trim();
    }

    return chunks;
  }

  /**
   * Setup event listeners for SessionManager
   * @private
   */
  setupEventListeners() {
    // Response ready - emit to parent (main.js will handle sending to Gateway)
    this.sessionManager.on('response-ready', ({ sessionId, userId, response, toolResults, stopReason }) => {
      this.logger.info(`[${sessionId}] Response ready from async processing`);

      // Find pending request for this user (to get gatewaySessionId)
      const pending = this.findPendingRequest(userId);

      if (pending) {
        // Resolve the promise if exists
        if (pending.resolve) {
          pending.resolve({
            userId,
            sessionId,
            gatewaySessionId: pending.gatewaySessionId,
            response,
            toolResults,
            stopReason
          });
        }

        // Split long response into chunks
        const chunks = this.splitMessage(response);

        // Emit event for main.js to handle delivery
        // If multiple chunks, emit them sequentially
        chunks.forEach((chunk, index) => {
          this.emit('async-response', {
            userId,
            sessionId,
            gatewaySessionId: pending.gatewaySessionId,
            response: chunk,
            toolResults: index === chunks.length - 1 ? toolResults : [], // Only attach toolResults to last chunk
            stopReason,
            isChunked: chunks.length > 1,
            chunkIndex: index,
            totalChunks: chunks.length
          });
        });

        // Remove from pending
        this.pendingRequests.delete(pending.requestId);
      } else {
        // No pending request - likely timed out
        // Try to get gatewaySessionId from lastGatewaySession cache
        const gatewaySessionId = this.lastGatewaySession.get(userId);

        if (gatewaySessionId) {
          this.logger.info(`[${sessionId}] Sending late response (after timeout) to user ${userId}`);

          // Add late response header and split if needed
          const lateResponse = `⏱️ *Late Response* (request timed out earlier)\n\n${response}`;
          const chunks = this.splitMessage(lateResponse);

          // Emit event for main.js to handle delivery with late response flag
          chunks.forEach((chunk, index) => {
            this.emit('async-response', {
              userId,
              sessionId,
              gatewaySessionId,
              response: chunk,
              toolResults: index === chunks.length - 1 ? toolResults : [],
              stopReason,
              isLateResponse: true,
              isChunked: chunks.length > 1,
              chunkIndex: index,
              totalChunks: chunks.length
            });
          });
        } else {
          this.logger.warn(`No pending request and no Gateway session cache found for user ${userId}`);
        }
      }
    });

    // Error handling
    this.sessionManager.on('error', ({ sessionId, userId, error }) => {
      this.logger.error(`[${sessionId}] Error:`, error.message);

      // Find pending request
      const pending = this.findPendingRequest(userId);

      if (pending) {
        // Reject the promise if exists
        if (pending.reject) {
          pending.reject(error);
        }

        // Emit error event for main.js to handle delivery
        this.emit('async-error', {
          userId,
          sessionId,
          gatewaySessionId: pending.gatewaySessionId,
          error: error.message
        });

        this.pendingRequests.delete(pending.requestId);
      }
    });
  }

  /**
   * Handle incoming message
   * @param {Object} data
   * @param {string} data.userId - WhatsApp phone number (628xxx)
   * @param {string} data.message - Message text
   * @param {string} [data.requestId] - Optional request ID for tracking
   * @param {string} [data.gatewaySessionId] - Gateway session ID for async reply routing
   * @returns {Promise<Object>} Response object
   */
  async handleMessage(data) {
    const { userId, message, requestId = this.generateRequestId(), gatewaySessionId } = data;

    this.logger.info(`[${requestId}] Message from ${userId}: ${message.substring(0, 50)}...`);

    // Check whitelist - silently ignore unauthorized numbers
    if (!this.isNumberAllowed(userId)) {
      this.logger.warn(`[${requestId}] Unauthorized access attempt from ${userId} - silently ignored`);

      return {
        requestId,
        response: null, // No response sent
        isError: false,
        isUnauthorized: true,
        silentDrop: true
      };
    }

    try {
      // Check if message is a command
      if (CommandParser.isCommand(message)) {
        return await this.handleCommand(userId, message, requestId);
      }

      // Regular prompt - route to SessionManager
      return await this.handlePrompt(userId, message, requestId, gatewaySessionId);

    } catch (error) {
      this.logger.error(`[${requestId}] Error:`, error.message);

      return {
        requestId,
        error: error.message,
        isError: true
      };
    }
  }

  /**
   * Handle command message
   * @private
   */
  async handleCommand(userId, message, requestId) {
    this.logger.info(`[${requestId}] Processing command via new command handler`);

    try {
      // Execute command via new command handler (with middleware)
      const response = await this.commandHandler.execute(userId, message);

      // Handle silent drop (unauthorized)
      if (response.message === null) {
        return {
          requestId,
          response: null,
          isCommand: true,
          isError: false,
          silentDrop: true
        };
      }

      return {
        requestId,
        response: response.message,
        isCommand: true,
        isError: !response.success,
        data: response.data
      };

    } catch (error) {
      this.logger.error(`[${requestId}] Command error:`, error.message);

      return {
        requestId,
        response: `❌ Command error: ${error.message}`,
        isCommand: true,
        isError: true
      };
    }
  }

  /**
   * Handle prompt message - TRUE ASYNC (no blocking wait)
   * @private
   */
  async handlePrompt(userId, message, requestId, gatewaySessionId) {
    this.logger.info(`[${requestId}] Processing prompt`);

    // Get active session
    const session = this.sessionManager.getActiveSession(userId);

    if (!session) {
      return {
        requestId,
        response: `❌ No active session.\n\n` +
                  `Use /newsession to create a session first.\n\n` +
                  `Type /help to see all available commands.`,
        isError: true
      };
    }

    if (session.state !== 'PROJECT_SELECTED') {
      return {
        requestId,
        response: `❌ No project selected.\n\n` +
                  `Use /setproject <path> to set a project first.\n\n` +
                  `Type /help to see all available commands.`,
        isError: true
      };
    }

    try {
      // Create promise for timeout handling
      let resolvePromise, rejectPromise;
      const timeoutPromise = new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });

      // Store request metadata with promise resolvers
      this.pendingRequests.set(requestId, {
        userId,
        sessionId: session.sessionId,
        gatewaySessionId, // Store for async response routing
        timestamp: Date.now(),
        resolve: resolvePromise,
        reject: rejectPromise
      });

      // Cache gatewaySessionId for this user (for late responses after timeout)
      this.lastGatewaySession.set(userId, gatewaySessionId);

      // Send message to SessionManager (fire and forget)
      // Response will come via 'response-ready' event and be sent directly by event handler
      await this.sessionManager.sendMessage(userId, session.sessionId, message);

      // Return immediate acknowledgment
      return {
        requestId,
        response: `⏳ Processing your request...\n\nThis might take a moment depending on the complexity.`,
        isError: false,
        isQueued: true // Flag to indicate this is just acknowledgment
      };

    } catch (error) {
      this.logger.error(`[${requestId}] Prompt error:`, error.message);

      // Cleanup
      this.pendingRequests.delete(requestId);

      return {
        requestId,
        response: `❌ Error: ${error.message}`,
        isError: true
      };
    }
  }

  /**
   * Find pending request by userId
   * @private
   */
  findPendingRequest(userId) {
    for (const [requestId, data] of this.pendingRequests.entries()) {
      if (data.userId === userId) {
        return { requestId, ...data };
      }
    }
    return null;
  }

  /**
   * Generate request ID
   * @private
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Cleanup old pending requests (called periodically)
   */
  cleanupPendingRequests() {
    const now = Date.now();
    const timeout = this.requestTimeout;

    for (const [requestId, data] of this.pendingRequests.entries()) {
      if (now - data.timestamp > timeout) {
        this.logger.warn(`Cleaning up timed out request: ${requestId}`);

        // Emit timeout event for main.js to send notification
        this.emit('request-timeout', {
          userId: data.userId,
          sessionId: data.sessionId,
          gatewaySessionId: data.gatewaySessionId,
          requestId
        });

        // Don't reject promise - timeout notification already sent via event
        // Rejecting would cause unhandled rejection since no one is awaiting this promise

        this.pendingRequests.delete(requestId);
      }
    }
  }

  /**
   * Get pending request count
   */
  getPendingRequestCount() {
    return this.pendingRequests.size;
  }

  /**
   * Shutdown gracefully - reject all pending requests
   */
  async shutdown() {
    this.logger.info('MessageHandler shutting down...');

    // Reject all pending requests
    for (const [requestId, data] of this.pendingRequests.entries()) {
      this.logger.warn(`Rejecting pending request due to shutdown: ${requestId}`);

      if (data.reject) {
        data.reject(new Error('System shutting down'));
      }
    }

    // Clear all pending requests and cache
    this.pendingRequests.clear();
    this.lastGatewaySession.clear();

    this.logger.info('MessageHandler shutdown complete');
  }
}

export default MessageHandler;
