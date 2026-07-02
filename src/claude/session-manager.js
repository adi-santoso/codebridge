/**
 * Session Manager
 *
 * High-level API for managing per-user Claude sessions
 *
 * This provides a cleaner interface on top of ACPClient:
 * - Automatic session creation
 * - Multi-turn conversation support
 * - Session cleanup
 */

import { ACPClient } from './acp-client.js';
import { Logger } from '../utils/logger.js';

export class SessionManager {
  constructor() {
    this.logger = new Logger('SessionManager');
    this.sessions = new Map();  // userId -> { client, sessionId }
  }

  /**
   * Get or create session for user
   *
   * @param {string} userId - User identifier (e.g., phone number)
   * @param {Object} options - Session options
   * @returns {Promise<Object>} Session info
   */
  async getOrCreateSession(userId, options = {}) {
    // Check if session already exists
    if (this.sessions.has(userId)) {
      this.logger.info('Reusing existing session for user:', userId);
      return this.sessions.get(userId);
    }

    // Create new session
    this.logger.info('Creating new session for user:', userId);

    const client = new ACPClient(options);
    await client.spawn();

    const sessionId = await client.createSession(options);

    const session = {
      userId,
      client,
      sessionId,
      createdAt: Date.now()
    };

    this.sessions.set(userId, session);

    this.logger.success('Session created for user:', userId);
    return session;
  }

  /**
   * Send message to user's session
   *
   * @param {string} userId - User identifier
   * @param {string} message - Message text
   * @returns {Promise<Object>} Response
   */
  async sendMessage(userId, message) {
    const session = this.sessions.get(userId);

    if (!session) {
      throw new Error(`No session found for user: ${userId}`);
    }

    this.logger.info('Sending message to user:', userId);
    this.logger.debug('Message:', message);

    const response = await session.client.sendPrompt(session.sessionId, message);

    return response;
  }

  /**
   * Close session for user
   *
   * @param {string} userId - User identifier
   */
  async closeSession(userId) {
    const session = this.sessions.get(userId);

    if (!session) {
      this.logger.warn('No session to close for user:', userId);
      return;
    }

    this.logger.info('Closing session for user:', userId);

    await session.client.closeSession(session.sessionId);
    await session.client.shutdown();

    this.sessions.delete(userId);

    this.logger.success('Session closed for user:', userId);
  }

  /**
   * Close all sessions
   */
  async closeAllSessions() {
    this.logger.info('Closing all sessions...');

    const userIds = Array.from(this.sessions.keys());

    for (const userId of userIds) {
      await this.closeSession(userId);
    }

    this.logger.success('All sessions closed');
  }

  /**
   * Get active session count
   */
  getActiveSessionCount() {
    return this.sessions.size;
  }

  /**
   * Get all active user IDs
   */
  getActiveUsers() {
    return Array.from(this.sessions.keys());
  }

  /**
   * Check if user has active session
   */
  hasSession(userId) {
    return this.sessions.has(userId);
  }
}

export default SessionManager;
