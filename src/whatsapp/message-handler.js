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

import { Logger } from '../utils/logger.js';
import { CommandParser } from '../commands/parser.js';
import { SessionCommands } from '../commands/session-commands.js';

export class MessageHandler {
  /**
   * Create MessageHandler instance
   * @param {Object} options
   * @param {SessionManager} options.sessionManager
   * @param {string} [options.projectRootPath] - Root path for projects
   */
  constructor(options) {
    this.sessionManager = options.sessionManager;
    this.logger = new Logger('MessageHandler');

    // Session commands handler
    this.sessionCommands = new SessionCommands({
      sessionManager: this.sessionManager,
      projectRootPath: options.projectRootPath
    });

    // Pending requests: requestId → { userId, resolve, reject, timestamp }
    this.pendingRequests = new Map();

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
    // Response ready - aggregate response from DirectClaudeSpawner
    this.sessionManager.on('response-ready', ({ sessionId, userId, response, toolResults, stopReason }) => {
      this.logger.info(`[${sessionId}] Response ready`);

      // Find pending request for this user
      const pending = this.findPendingRequest(userId);

      if (pending) {
        // Resolve with response
        pending.resolve({
          response,
          toolResults,
          stopReason,
          sessionId
        });

        // Remove from pending
        this.pendingRequests.delete(pending.requestId);
      } else {
        this.logger.warn(`No pending request found for user ${userId}`);
      }
    });

    // Error handling
    this.sessionManager.on('error', ({ sessionId, userId, error }) => {
      this.logger.error(`[${sessionId}] Error:`, error.message);

      // Find pending request
      const pending = this.findPendingRequest(userId);

      if (pending) {
        pending.reject(error);
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
   * @returns {Promise<Object>} Response object
   */
  async handleMessage(data) {
    const { userId, message, requestId = this.generateRequestId() } = data;

    this.logger.info(`[${requestId}] Message from ${userId}: ${message.substring(0, 50)}...`);

    try {
      // Check if message is a command
      if (CommandParser.isCommand(message)) {
        return await this.handleCommand(userId, message, requestId);
      }

      // Regular prompt - route to SessionManager
      return await this.handlePrompt(userId, message, requestId);

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
   * Handle prompt message
   * @private
   */
  async handlePrompt(userId, message, requestId) {
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

    // Create promise that resolves when response is ready
    const responsePromise = new Promise((resolve, reject) => {
      // Store pending request
      this.pendingRequests.set(requestId, {
        userId,
        sessionId: session.sessionId,
        resolve,
        reject,
        timestamp: Date.now()
      });

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, this.requestTimeout);
    });

    try {
      // Send message to SessionManager (non-blocking)
      // Response will come via 'response-ready' event
      await this.sessionManager.sendMessage(userId, session.sessionId, message);

      // Wait for response
      const result = await responsePromise;

      return {
        requestId,
        response: result.response,
        toolResults: result.toolResults,
        stopReason: result.stopReason,
        sessionId: result.sessionId,
        isError: false
      };

    } catch (error) {
      this.logger.error(`[${requestId}] Prompt error:`, error.message);

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
        data.reject(new Error('Request timeout'));
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
}

export default MessageHandler;
