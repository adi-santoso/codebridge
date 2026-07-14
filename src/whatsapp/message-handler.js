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

export class MessageHandler extends EventEmitter {
  /**
   * Create MessageHandler instance
   * @param {Object} options
   * @param {SessionManager} options.sessionManager
   * @param {string} [options.projectRootPath] - Root path for projects
   */
  constructor(options) {
    super(); // Initialize EventEmitter

    this.sessionManager = options.sessionManager;
    this.logger = new Logger('MessageHandler');

    // Session commands handler
    this.sessionCommands = new SessionCommands({
      sessionManager: this.sessionManager,
      projectRootPath: options.projectRootPath
    });

    // Pending requests: requestId → { userId, resolve, reject, timestamp }
    this.pendingRequests = new Map();

    // Cache last gatewaySessionId per user for late responses
    this.lastGatewaySession = new Map();

    // Request timeout (120 seconds - Claude tools can take time)
    this.requestTimeout = 120000;

    // Setup event listeners
    this.setupEventListeners();
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

        // Emit event for main.js to handle delivery
        this.emit('async-response', {
          userId,
          sessionId,
          gatewaySessionId: pending.gatewaySessionId,
          response,
          toolResults,
          stopReason
        });

        // Remove from pending
        this.pendingRequests.delete(pending.requestId);
      } else {
        // No pending request - likely timed out
        // Try to get gatewaySessionId from lastGatewaySession cache
        const gatewaySessionId = this.lastGatewaySession.get(userId);

        if (gatewaySessionId) {
          this.logger.info(`[${sessionId}] Sending late response (after timeout) to user ${userId}`);

          // Emit event for main.js to handle delivery with late response flag
          this.emit('async-response', {
            userId,
            sessionId,
            gatewaySessionId,
            response: `⏱️ *Late Response* (request timed out earlier)\n\n${response}`,
            toolResults,
            stopReason,
            isLateResponse: true
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
    this.logger.info(`[${requestId}] Processing command`);

    try {
      // Execute command
      const response = await this.sessionCommands.execute(userId, message);

      return {
        requestId,
        response,
        isCommand: true,
        isError: false
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
        response: `👋 Welcome to CodeBridge!\n\n` +
                  `I'm your AI coding assistant powered by Claude. To get started:\n\n` +
                  `📋 *Session Management:*\n` +
                  `/newsession - Create new session\n` +
                  `/sessions - List all sessions\n` +
                  `/session <id> - Switch to session\n` +
                  `/closesession - Close current session\n\n` +
                  `📁 *Project Management:*\n` +
                  `/projects - List available projects\n` +
                  `/project <name> - Select project\n\n` +
                  `💬 *Other Commands:*\n` +
                  `/clear - Clear session history\n` +
                  `/status - Show current status\n` +
                  `/help - Show this help\n\n` +
                  `*Quick Start:*\n` +
                  `1️⃣ Type: /newsession\n` +
                  `2️⃣ Type: /projects\n` +
                  `3️⃣ Type: /project <name>\n` +
                  `4️⃣ Start chatting!\n\n` +
                  `Let's build something amazing together! 🚀`,
        isError: false
      };
    }

    if (session.state !== 'PROJECT_SELECTED') {
      return {
        requestId,
        response: `📁 *Project Selection Required*\n\n` +
                  `You have an active session, but no project selected yet.\n\n` +
                  `To select a project:\n` +
                  `1️⃣ Type: /projects (to see available projects)\n` +
                  `2️⃣ Type: /project <name> (to select one)\n\n` +
                  `Example: /project codebridge\n\n` +
                  `Once a project is selected, I can help you with:\n` +
                  `• Writing and reviewing code\n` +
                  `• Debugging issues\n` +
                  `• Explaining concepts\n` +
                  `• Refactoring code\n` +
                  `• And much more!`,
        isError: false
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

        // Reject the promise if exists
        if (data.reject) {
          data.reject(new Error('Request timeout'));
        }

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
