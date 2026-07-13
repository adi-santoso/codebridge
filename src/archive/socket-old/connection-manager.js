/**
 * Connection Manager
 * Handles Socket.IO client connections, authentication, and lifecycle
 */

import Logger from '../utils/logger.js';
import { socketConfig } from '../config/socket-config.js';

const logger = new Logger('ConnectionManager');

export class ConnectionManager {
  constructor() {
    this.connections = new Map(); // clientId -> connection info
    this.rateLimits = new Map(); // clientId -> request timestamps
  }

  /**
   * Handle new client connection
   * @param {Socket} socket - Socket.IO socket
   * @param {Function} onAuthenticated - Callback when client is authenticated
   */
  handleConnection(socket, onAuthenticated) {
    const clientId = socket.id;
    logger.info(`New connection attempt: ${clientId}`);

    // Store connection info
    this.connections.set(clientId, {
      id: clientId,
      connectedAt: Date.now(),
      authenticated: false,
      metadata: {}
    });

    // Setup authentication timeout
    const authTimeout = setTimeout(() => {
      if (!this.connections.get(clientId)?.authenticated) {
        logger.warn(`Authentication timeout for client: ${clientId}`);
        socket.emit('error', {
          code: 'AUTH_TIMEOUT',
          message: 'Authentication required within 5 seconds'
        });
        socket.disconnect(true);
      }
    }, 5000);

    // Wait for authentication
    socket.once('authenticate', (data) => {
      clearTimeout(authTimeout);
      this.handleAuthentication(socket, data, onAuthenticated);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });
  }

  /**
   * Handle client authentication
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Authentication data
   * @param {Function} onAuthenticated - Callback when authenticated
   */
  handleAuthentication(socket, data, onAuthenticated) {
    const clientId = socket.id;
    const { authKey, metadata = {} } = data || {};

    // Validate auth key
    if (authKey !== socketConfig.authKey) {
      logger.warn(`Invalid auth key from client: ${clientId}`);
      socket.emit('auth:error', {
        code: 'INVALID_AUTH_KEY',
        message: 'Invalid authentication key'
      });
      socket.disconnect(true);
      return;
    }

    // Mark as authenticated
    const connection = this.connections.get(clientId);
    if (connection) {
      connection.authenticated = true;
      connection.metadata = metadata;
      this.connections.set(clientId, connection);
    }

    logger.info(`Client authenticated: ${clientId}`, metadata);
    socket.emit('auth:success', {
      clientId,
      serverTime: Date.now()
    });

    // Call the callback after authentication is complete
    if (onAuthenticated) {
      onAuthenticated(socket);
    }
  }

  /**
   * Check if client is authenticated
   */
  isAuthenticated(clientId) {
    const connection = this.connections.get(clientId);
    return connection?.authenticated || false;
  }

  /**
   * Rate limiting check
   */
  checkRateLimit(clientId) {
    const now = Date.now();
    const { maxRequests, windowMs } = socketConfig.rateLimit;

    // Get request history
    let requests = this.rateLimits.get(clientId) || [];

    // Remove old requests outside the window
    requests = requests.filter(timestamp => now - timestamp < windowMs);

    // Check if limit exceeded
    if (requests.length >= maxRequests) {
      logger.warn(`Rate limit exceeded for client: ${clientId}`);
      return false;
    }

    // Add current request
    requests.push(now);
    this.rateLimits.set(clientId, requests);

    return true;
  }

  /**
   * Handle client disconnection
   */
  handleDisconnection(socket, reason) {
    const clientId = socket.id;
    const connection = this.connections.get(clientId);

    if (connection) {
      const duration = Date.now() - connection.connectedAt;
      logger.info(`Client disconnected: ${clientId}`, {
        reason,
        duration: `${Math.round(duration / 1000)}s`,
        metadata: connection.metadata
      });

      this.connections.delete(clientId);
      this.rateLimits.delete(clientId);
    }
  }

  /**
   * Get connection info
   */
  getConnection(clientId) {
    return this.connections.get(clientId);
  }

  /**
   * Get all active connections
   */
  getActiveConnections() {
    return Array.from(this.connections.values()).filter(c => c.authenticated);
  }

  /**
   * Get connection count
   */
  getConnectionCount() {
    return this.getActiveConnections().length;
  }

  /**
   * Get stats
   */
  getStats() {
    const authenticated = this.getActiveConnections();
    const unauthenticated = Array.from(this.connections.values()).filter(c => !c.authenticated);

    return {
      total: this.connections.size,
      authenticated: authenticated.length,
      unauthenticated: unauthenticated.length,
      connections: authenticated.map(c => ({
        id: c.id,
        connectedAt: c.connectedAt,
        duration: Date.now() - c.connectedAt,
        metadata: c.metadata
      }))
    };
  }
}

export default ConnectionManager;
