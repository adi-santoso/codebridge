/**
 * CodeBridge Main Entry Point
 *
 * Gateway Client Mode - Connects to external Gateway Server
 *
 * Architecture:
 * - GatewayClient: Socket.IO client to Gateway Server
 * - SessionRoomManager: Manages session rooms (join/leave)
 * - SessionManager: Manages Claude sessions (existing)
 * - MessageHandler: Routes messages to sessions (existing)
 *
 * Flow:
 * 1. Connect to Gateway Server
 * 2. Join session rooms for active sessions
 * 3. Listen for whatsapp:message events
 * 4. Route to MessageHandler → SessionManager → Claude
 * 5. Send response back via codebridge:response
 */

import dotenv from 'dotenv';
import GatewayClient from './gateway-client.js';
import SessionRoomManager from './session-room-manager.js';
import SessionManager from './claude/session-manager.js';
import MessageHandler from './whatsapp/message-handler.js';
import { Logger } from './utils/logger.js';

// Load environment variables
dotenv.config();

class CodeBridge {
  constructor() {
    this.gatewayClient = null;
    this.sessionRoomManager = null;
    this.sessionManager = null;
    this.messageHandler = null;
    this.isShuttingDown = false;
    this.logger = new Logger('CodeBridge');

    this.logger.info('Initializing...');
  }

  /**
   * Initialize all components
   */
  async initialize() {
    try {
      // 1. Initialize SessionManager
      this.logger.info('[CodeBridge] Initializing SessionManager...');
      this.sessionManager = new SessionManager({
        projectRootPath: process.env.PROJECT_ROOT_PATH || 'D:/working/gatrion',
        dbPath: process.env.SESSION_DB_PATH || './.codebridge/sessions.db',
        maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '50'),
        maxHistoryLength: parseInt(process.env.MAX_HISTORY_LENGTH || '20')
      });
      await this.sessionManager.initialize();

      // 2. Initialize MessageHandler
      this.logger.info('[CodeBridge] Initializing MessageHandler...');
      this.messageHandler = new MessageHandler({
        sessionManager: this.sessionManager,
        projectRootPath: process.env.PROJECT_ROOT_PATH || 'D:/working/gatrion'
      });

      // 3. Initialize GatewayClient
      this.logger.info('[CodeBridge] Initializing GatewayClient...');
      this.gatewayClient = new GatewayClient({
        gatewayUrl: process.env.GATEWAY_URL,
        authKey: process.env.GATEWAY_AUTH_KEY
      });

      // 4. Connect to Gateway
      this.logger.info('[CodeBridge] Connecting to Gateway...');
      await this.gatewayClient.connect();

      // 5. Initialize SessionRoomManager
      this.logger.info('[CodeBridge] Initializing SessionRoomManager...');
      this.sessionRoomManager = new SessionRoomManager(
        this.gatewayClient,
        this.sessionManager
      );
      this.sessionRoomManager.initialize();

      // 6. Setup Gateway event handlers
      this.setupGatewayHandlers();

      // 7. Setup SessionManager hooks
      this.setupSessionHooks();

      this.logger.info('[CodeBridge] Initialization completed successfully ✅');

      // 8. Manual join existing Gateway sessions (if specified in env)
      await this.joinExistingGatewaySessions();

      this.printStatus();

    } catch (error) {
      this.logger.error('[CodeBridge] Initialization failed:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Setup Gateway event handlers
   */
  setupGatewayHandlers() {
    // Handle incoming whatsapp:message from Gateway
    this.gatewayClient.on('whatsapp:message', async (data) => {
      try {
        this.logger.info('[CodeBridge] Processing whatsapp:message', {
          from: data.from,
          sessionId: data.sessionId,
          messagePreview: data.message.substring(0, 50)
        });

        // Route to MessageHandler
        const result = await this.messageHandler.handleMessage({
          userId: data.from, // Phone number
          message: data.message,
          requestId: `${data.sessionId}_${data.timestamp}`,
          gatewaySessionId: data.sessionId // Gateway session ID for reply
        });

        // Send immediate response (acknowledgment or command result)
        if (result.response) {
          this.gatewayClient.sendResponse({
            sessionId: data.sessionId,
            to: data.from,
            message: result.response,
            timestamp: Date.now()
          });

          this.logger.info('[CodeBridge] Response sent', {
            sessionId: data.sessionId,
            to: data.from,
            isError: result.isError,
            isQueued: result.isQueued,
            responseLength: result.response.length
          });
        } else {
          this.logger.warn('[CodeBridge] No response to send', { result });
        }

        // For queued prompts, actual response will come via 'async-response' event

      } catch (error) {
        this.logger.error('[CodeBridge] Error processing message', {
          error: error.message,
          data
        });

        // Send error response
        this.gatewayClient.sendResponse({
          sessionId: data.sessionId,
          to: data.from,
          message: `❌ CodeBridge error: ${error.message}`,
          timestamp: Date.now()
        });
      }
    });

    this.logger.info('[CodeBridge] Gateway handlers setup completed');
  }

  /**
   * Setup SessionManager hooks untuk room management
   */
  setupSessionHooks() {
    // Hook session creation
    this.sessionManager.on('session-created', ({ sessionId, userId }) => {
      this.logger.info('[CodeBridge] Session created - joining room', {
        sessionId,
        userId
      });
      this.sessionRoomManager.onSessionCreated(sessionId, userId);
    });

    // Hook session closure
    this.sessionManager.on('session-closed', ({ sessionId, userId }) => {
      this.logger.info('[CodeBridge] Session closed - leaving room', {
        sessionId,
        userId
      });
      this.sessionRoomManager.onSessionClosed(sessionId);
    });

    // Hook async response ready from MessageHandler (queue result delivery)
    this.messageHandler.on('async-response', ({ userId, sessionId, gatewaySessionId, response }) => {
      this.logger.info('[CodeBridge] Async response ready - delivering to user', {
        sessionId,
        gatewaySessionId,
        userId,
        responseLength: response.length
      });

      // Send async response to Gateway
      this.gatewayClient.sendResponse({
        sessionId: gatewaySessionId,
        to: userId,
        message: response,
        timestamp: Date.now()
      });

      this.logger.success('[CodeBridge] Async response delivered', {
        gatewaySessionId,
        to: userId
      });
    });

    // Hook async errors from MessageHandler
    this.messageHandler.on('async-error', ({ userId, sessionId, gatewaySessionId, error }) => {
      this.logger.error('[CodeBridge] Async error - delivering to user', {
        sessionId,
        gatewaySessionId,
        userId,
        error
      });

      // Send error message to Gateway
      this.gatewayClient.sendResponse({
        sessionId: gatewaySessionId,
        to: userId,
        message: `❌ Error: ${error}`,
        timestamp: Date.now()
      });
    });

    this.logger.info('[CodeBridge] Session hooks setup completed');
  }

  /**
   * Join existing Gateway sessions (manually specified)
   * Reads GATEWAY_SESSIONS env variable for comma-separated session IDs
   */
  async joinExistingGatewaySessions() {
    const sessionsEnv = process.env.GATEWAY_SESSIONS;

    if (!sessionsEnv) {
      this.logger.info('[CodeBridge] No existing Gateway sessions to join (GATEWAY_SESSIONS not set)');
      return;
    }

    const sessionIds = sessionsEnv.split(',').map(s => s.trim()).filter(Boolean);

    if (sessionIds.length === 0) {
      this.logger.warn('[CodeBridge] GATEWAY_SESSIONS is empty');
      return;
    }

    this.logger.info('[CodeBridge] Joining existing Gateway sessions:', {
      count: sessionIds.length,
      sessions: sessionIds
    });

    for (const sessionId of sessionIds) {
      try {
        this.gatewayClient.joinRoom(sessionId);
        this.logger.success(`[CodeBridge] Joined room: ${sessionId}`);
      } catch (error) {
        this.logger.error(`[CodeBridge] Failed to join room: ${sessionId}`, {
          error: error.message
        });
      }
    }

    this.logger.success('[CodeBridge] Finished joining Gateway sessions');
  }

  /**
   * Print current status
   */
  printStatus() {
    const status = {
      gateway: {
        connected: this.gatewayClient.isSocketConnected(),
        url: this.gatewayClient.gatewayUrl,
        activeRooms: this.gatewayClient.getActiveRooms().length
      },
      sessions: {
        total: this.sessionManager.getTotalSessions(),
        active: this.sessionManager.getActiveSessions().length
      },
      messageHandler: {
        pendingRequests: this.messageHandler.getPendingRequestCount()
      }
    };

    this.logger.info('[CodeBridge] Current Status:', status);
  }

  /**
   * Start periodic cleanup tasks
   */
  startPeriodicTasks() {
    // Cleanup pending requests every 30 seconds
    setInterval(() => {
      this.messageHandler.cleanupPendingRequests();
    }, 30000);

    // Log status every 5 minutes
    setInterval(() => {
      this.printStatus();
    }, 300000);

    this.logger.info('[CodeBridge] Periodic tasks started');
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('[CodeBridge] Shutting down gracefully...');

    try {
      // 1. Stop accepting new messages & reject pending requests
      if (this.messageHandler) {
        await this.messageHandler.shutdown();
      }

      // 2. Cleanup session rooms
      if (this.sessionRoomManager) {
        await this.sessionRoomManager.cleanup();
      }

      // 3. Disconnect from Gateway
      if (this.gatewayClient) {
        this.gatewayClient.disconnect();
      }

      // 4. Shutdown SessionManager
      if (this.sessionManager) {
        await this.sessionManager.shutdown();
      }

      this.logger.info('[CodeBridge] Shutdown completed ✅');
      process.exit(0);

    } catch (error) {
      this.logger.error('[CodeBridge] Shutdown error:', {
        error: error.message
      });
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  const logger = new Logger('CodeBridge');
  const codeBridge = new CodeBridge();

  // Setup graceful shutdown handlers
  const shutdownHandler = () => {
    codeBridge.shutdown();
  };

  process.on('SIGINT', shutdownHandler);
  process.on('SIGTERM', shutdownHandler);
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', {
      error: error.message,
      stack: error.stack
    });
    codeBridge.shutdown();
  });
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection:', {
      reason,
      promise
    });
  });

  try {
    // Initialize and start
    await codeBridge.initialize();
    codeBridge.startPeriodicTasks();

    logger.info('Running... Press Ctrl+C to stop');

  } catch (error) {
    logger.error('Failed to start:', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Start the application
main();
