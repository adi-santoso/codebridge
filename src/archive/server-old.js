/**
 * CodeBridge Socket.IO Server
 * Main entry point for the Socket.IO server
 */

import { Server } from 'socket.io';
import { createServer } from 'http';
import { SessionManager } from './claude/session-manager.js';
import { MessageHandler } from './whatsapp/message-handler.js';
import { ConnectionManager } from './socket/connection-manager.js';
import { EventHandlers } from './socket/event-handlers.js';
import { socketConfig } from './config/socket-config.js';
import { Logger } from './utils/logger.js';

class CodeBridgeServer {
  constructor() {
    this.httpServer = null;
    this.io = null;
    this.sessionManager = null;
    this.messageHandler = null;
    this.connectionManager = null;
    this.eventHandlers = null;
    this.logger = new Logger('Server');
  }

  /**
   * Initialize server
   */
  async initialize() {
    try {
      this.logger.info('Initializing CodeBridge server...');

      // Create HTTP server
      this.httpServer = createServer((req, res) => {
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            timestamp: Date.now(),
            connections: this.connectionManager?.getConnectionCount() || 0
          }));
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      // Create Socket.IO server
      this.io = new Server(this.httpServer, {
        cors: socketConfig.cors,
        pingTimeout: socketConfig.pingTimeout,
        pingInterval: socketConfig.pingInterval,
        upgradeTimeout: socketConfig.upgradeTimeout,
        maxHttpBufferSize: socketConfig.maxHttpBufferSize
      });

      // Initialize SessionManager (Phase 5 - DirectClaudeSpawner based)
      this.sessionManager = new SessionManager({
        dbPath: process.env.SESSION_DB_PATH || './.codebridge/sessions.db'
      });

      // Initialize MessageHandler (Phase 5 - Routes to SessionManager)
      this.messageHandler = new MessageHandler({
        sessionManager: this.sessionManager,
        projectRootPath: process.env.PROJECT_ROOT_PATH || process.cwd()
      });

      // Initialize ConnectionManager
      this.connectionManager = new ConnectionManager();

      // Initialize EventHandlers (Phase 5 - Uses MessageHandler)
      this.eventHandlers = new EventHandlers(this.messageHandler, this.connectionManager);

      // Setup Socket.IO connection handler
      this.io.on('connection', (socket) => {
        this.handleConnection(socket);
      });

      // Setup cleanup interval (every 5 minutes)
      setInterval(() => {
        this.messageHandler.cleanupPendingRequests();
      }, 5 * 60 * 1000);

      this.logger.success('Server initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize server:', error);
      throw error;
    }
  }

  /**
   * Handle new socket connection
   */
  handleConnection(socket) {
    const clientId = socket.id;
    this.logger.info(`New connection: ${clientId} (${socket.handshake.address})`);

    // Handle connection via ConnectionManager
    // Pass callback to register event handlers after authentication
    this.connectionManager.handleConnection(socket, (authenticatedSocket) => {
      this.eventHandlers.register(authenticatedSocket);
      this.logger.debug(`Event handlers registered for authenticated client: ${clientId}`);
    });
  }

  /**
   * Start server
   */
  async start() {
    try {
      await this.initialize();

      const port = socketConfig.port;

      this.httpServer.listen(port, () => {
        this.logger.success(`🚀 CodeBridge server running on port ${port}`);
        this.logger.info(`Socket.IO endpoint: http://localhost:${port}`);
        this.logger.info(`Health check: http://localhost:${port}/health`);
        this.logger.info(`Session DB: ${process.env.SESSION_DB_PATH || './.codebridge/sessions.db'}`);
        this.logger.info(`Project root: ${process.env.PROJECT_ROOT_PATH || process.cwd()}`);
        this.logger.info('');
        this.logger.info('Waiting for client connections...');
      });

      // Graceful shutdown
      process.on('SIGINT', () => this.shutdown('SIGINT'));
      process.on('SIGTERM', () => this.shutdown('SIGTERM'));

    } catch (error) {
      this.logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Shutdown server gracefully
   */
  async shutdown(signal) {
    this.logger.info(`\nReceived ${signal}, shutting down gracefully...`);

    try {
      // Close SessionManager (close all spawners and database)
      if (this.sessionManager) {
        await this.sessionManager.shutdown();
        this.logger.info('SessionManager shut down');
      }

      // Close all socket connections
      if (this.io) {
        this.io.close();
        this.logger.info('Socket.IO server closed');
      }

      // Close HTTP server
      if (this.httpServer) {
        this.httpServer.close(() => {
          this.logger.info('HTTP server closed');
        });
      }

      // Log final stats
      if (this.connectionManager) {
        const stats = this.connectionManager.getStats();
        this.logger.info('Final stats:', stats);
      }

      this.logger.success('Server shut down successfully');
      process.exit(0);

    } catch (error) {
      this.logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Get server stats
   */
  getStats() {
    return {
      connections: this.connectionManager?.getStats() || {},
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
  }
}

// Start server if this file is run directly
const isMainModule = process.argv[1] && (
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
);

if (isMainModule) {
  const server = new CodeBridgeServer();
  server.start();
}

export default CodeBridgeServer;
