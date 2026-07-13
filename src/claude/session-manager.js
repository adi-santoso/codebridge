/**
 * Session Manager - Phase 5
 *
 * Manages multiple sessions per user with DirectClaudeSpawner
 * - Session persistence via SQLite
 * - Session state machine (NO_SESSION → SESSION_SELECTED → PROJECT_SELECTED)
 * - Multiple sessions per user with explicit routing
 * - Event-based response aggregation
 * - Tool execution via ToolExecutor
 */

import { EventEmitter } from 'events';
import { DirectClaudeSpawner } from './direct-spawner.js';
import { SessionDatabase } from '../database/session-db.js';
import { ToolExecutor } from '../tools/executor.js';
import { Logger } from '../utils/logger.js';

export class SessionManager extends EventEmitter {
  /**
   * Create SessionManager instance
   * @param {Object} options
   * @param {string} [options.dbPath='./.codebridge/sessions.db'] - SQLite database path
   */
  constructor(options = {}) {
    super();

    this.logger = new Logger('SessionManager');

    // SQLite database for session persistence
    this.db = new SessionDatabase({
      path: options.dbPath || process.env.SESSION_DB_PATH || './.codebridge/sessions.db'
    });

    // DirectClaudeSpawner instances: sessionId → spawner
    this.spawners = new Map();

    // ToolExecutor instances: sessionId → executor
    this.executors = new Map();

    // Active session per user: userId → sessionId
    this.activeSessionMap = new Map();

    // Response aggregation: sessionId → { text: '', toolResults: [] }
    this.responseBuffers = new Map();

    this.logger.success('SessionManager constructor initialized');
  }

  /**
   * Initialize SessionManager - async initialization
   */
  async initialize() {
    this.logger.info('Initializing SessionManager...');

    // Restore active sessions from database
    await this.restoreActiveSessions();

    this.logger.success('SessionManager initialized and ready');
  }

  /**
   * Restore active sessions from database on startup
   * Spawns Claude subprocesses for sessions with PROJECT_SELECTED state
   * @private
   */
  async restoreActiveSessions() {
    try {
      // Get all sessions from database
      const allSessions = this.db.getAllSessions();

      if (allSessions.length === 0) {
        this.logger.info('No sessions to restore');
        return;
      }

      this.logger.info(`Found ${allSessions.length} sessions in database, checking which to restore...`);

      let restoredCount = 0;
      let skippedCount = 0;

      for (const session of allSessions) {
        // Only restore sessions that have project selected (ready to code)
        if (session.state !== 'PROJECT_SELECTED') {
          this.logger.debug(`Skipping session ${session.sessionId} (state: ${session.state})`);
          skippedCount++;
          continue;
        }

        // Only restore if there's an active session set for this user
        const currentActiveSession = this.activeSessionMap.get(session.userId);
        if (currentActiveSession && currentActiveSession !== session.sessionId) {
          this.logger.debug(`Skipping session ${session.sessionId} (not active for user ${session.userId})`);
          skippedCount++;
          continue;
        }

        try {
          this.logger.info(`Restoring session: ${session.sessionId} for user ${session.userId}`);

          // Spawn Claude subprocess
          const spawner = new DirectClaudeSpawner({
            projectPath: session.projectPath,
            sessionId: session.sessionId
          });

          // Setup event handlers
          this.setupSpawnerEvents(spawner, session.sessionId, session.userId);

          // Store spawner
          this.spawners.set(session.sessionId, spawner);

          // Create ToolExecutor
          const executor = new ToolExecutor({
            projectPath: session.projectPath,
            sessionId: session.sessionId
          });
          this.executors.set(session.sessionId, executor);

          // Restore active session mapping
          this.activeSessionMap.set(session.userId, session.sessionId);

          restoredCount++;
          this.logger.success(`Session ${session.sessionId} restored successfully`);

        } catch (error) {
          this.logger.error(`Failed to restore session ${session.sessionId}:`, error.message);
          skippedCount++;
        }
      }

      this.logger.success(`Session restoration complete: ${restoredCount} restored, ${skippedCount} skipped`);

    } catch (error) {
      this.logger.error('Failed to restore sessions:', error.message);
    }
  }

  /**
   * Get active session for user
   * @param {string} userId - WhatsApp phone number
   * @returns {Object|null} Session object or null
   */
  getActiveSession(userId) {
    const sessionId = this.activeSessionMap.get(userId);
    if (!sessionId) {
      return null;
    }

    return this.db.getSessionById(sessionId);
  }

  /**
   * Create new session for user
   * @param {string} userId - WhatsApp phone number
   * @returns {Object} Created session
   */
  createSession(userId) {
    const sessionId = this.db.generateSessionId();

    this.logger.info(`Creating new session ${sessionId} for user ${userId}`);

    // Create session in database
    const session = this.db.createSession(userId, sessionId);

    // Set as active session
    this.activeSessionMap.set(userId, sessionId);

    this.logger.success(`Session created: ${sessionId}`);

    // Emit session-created event for room management
    this.emit('session-created', { sessionId, userId });

    return session;
  }

  /**
   * Switch to specific session
   * @param {string} userId
   * @param {string} sessionId
   * @returns {Object} Session object
   */
  switchSession(userId, sessionId) {
    const session = this.db.getSessionById(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.userId !== userId) {
      throw new Error(`Session ${sessionId} does not belong to user ${userId}`);
    }

    // Update active session
    this.activeSessionMap.set(userId, sessionId);

    // Touch session
    this.db.touchSession(sessionId);

    this.logger.info(`User ${userId} switched to session ${sessionId}`);

    return session;
  }

  /**
   * Get all sessions for user
   * @param {string} userId
   * @returns {Array<Object>}
   */
  getUserSessions(userId) {
    return this.db.getUserSessions(userId);
  }

  /**
   * Set project for session
   * @param {string} sessionId
   * @param {string} projectPath - Absolute path to project
   */
  setSessionProject(sessionId, projectPath) {
    this.logger.info(`Setting project for session ${sessionId}: ${projectPath}`);

    // Update database
    this.db.setSessionProject(sessionId, projectPath);

    // Create DirectClaudeSpawner for this session
    const spawner = new DirectClaudeSpawner({
      projectPath
    });

    // Setup event handlers
    const session = this.db.getSessionById(sessionId);
    this.setupSpawnerEvents(spawner, sessionId, session.userId);

    // Store spawner
    this.spawners.set(sessionId, spawner);

    // Create ToolExecutor
    const executor = new ToolExecutor({ projectPath });
    this.executors.set(sessionId, executor);

    this.logger.success(`Project set for session ${sessionId}`);
  }

  /**
   * Setup event handlers for DirectClaudeSpawner
   * @private
   */
  setupSpawnerEvents(spawner, sessionId, userId) {
    // Text delta - aggregate response
    spawner.on('text', ({ userId, text }) => {
      if (!this.responseBuffers.has(sessionId)) {
        this.responseBuffers.set(sessionId, { text: '', toolResults: [] });
      }

      const buffer = this.responseBuffers.get(sessionId);
      buffer.text += text;
    });

    // Tool use - execute tool and send result back
    spawner.on('tool-use', async ({ userId, tool }) => {
      this.logger.info(`[${sessionId}] Tool use: ${tool.name}`);

      try {
        const executor = this.executors.get(sessionId);
        const result = await executor.execute(tool);

        // Send tool result back to Claude
        spawner.sendToolResult(userId, tool.id, result.content, result.isError);

        // Store tool result in buffer
        const buffer = this.responseBuffers.get(sessionId);
        if (buffer) {
          buffer.toolResults.push({
            toolName: tool.name,
            toolId: tool.id,
            result: result.content,
            isError: result.isError
          });
        }
      } catch (error) {
        this.logger.error(`[${sessionId}] Tool execution error:`, error.message);

        // Send error back to Claude
        spawner.sendToolResult(userId, tool.id, `Tool execution error: ${error.message}`, true);
      }
    });

    // Turn end - emit aggregated response
    spawner.on('turn-end', ({ userId, stopReason }) => {
      this.logger.info(`[${sessionId}] Turn ended: ${stopReason}`);

      const buffer = this.responseBuffers.get(sessionId);

      if (buffer) {
        // Emit response ready event
        this.emit('response-ready', {
          sessionId,
          userId,
          response: buffer.text,
          toolResults: buffer.toolResults,
          stopReason
        });

        // Clear buffer
        this.responseBuffers.delete(sessionId);
      }

      // Touch session (update lastActive)
      this.db.touchSession(sessionId);
    });

    // Error handling
    spawner.on('error', ({ userId, error }) => {
      this.logger.error(`[${sessionId}] Error:`, error.message);

      this.emit('error', {
        sessionId,
        userId,
        error
      });
    });

    // Debug logging
    spawner.on('debug', ({ userId, message }) => {
      this.logger.debug(`[${sessionId}] ${message}`);
    });
  }

  /**
   * Send message to session
   * @param {string} userId
   * @param {string} sessionId
   * @param {string} message
   */
  async sendMessage(userId, sessionId, message) {
    const session = this.db.getSessionById(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.state !== 'PROJECT_SELECTED') {
      throw new Error(`Session ${sessionId} has no project selected`);
    }

    const spawner = this.spawners.get(sessionId);

    if (!spawner) {
      throw new Error(`No spawner for session ${sessionId}. Project may not be set correctly.`);
    }

    // Initialize response buffer
    this.responseBuffers.set(sessionId, { text: '', toolResults: [] });

    // Create or get Claude session
    let claudeSession = spawner.sessions.get(userId);
    if (!claudeSession) {
      claudeSession = await spawner.createSession(userId);
    }

    // Prepend WhatsApp formatting instructions to user message
    const enhancedMessage = `[SYSTEM: WhatsApp chat interface - mobile screen, vertical scroll, tedious copy-paste.
FORMAT: *bold* for emphasis, _italic_ secondary, \`code\` inline, \`\`\`lang for blocks.
CONSTRAINTS: Max 4000 chars per message, prioritize actionable info.
STYLE: Short paragraphs (3-4 lines max), bullet points (• or -), scannable layout.
EMOJIS: Minimal use for visual cues only.
PATHS: Use backticks. COMMANDS: Use code blocks.]

${message}`;

    // Send enhanced message
    await claudeSession.sendPrompt(enhancedMessage);
  }

  /**
   * Close session
   * @param {string} sessionId
   */
  async closeSession(sessionId) {
    this.logger.info(`Closing session ${sessionId}`);

    // Get session info before deletion (for event emit)
    const session = this.db.getSessionById(sessionId);
    const userId = session?.userId;

    // Get spawner
    const spawner = this.spawners.get(sessionId);

    if (spawner) {
      // Close all Claude sessions in this spawner
      await spawner.closeAll();

      // Remove from map
      this.spawners.delete(sessionId);
    }

    // Remove executor
    this.executors.delete(sessionId);

    // Remove response buffer
    this.responseBuffers.delete(sessionId);

    // Remove from activeSessionMap
    for (const [uid, activeSessionId] of this.activeSessionMap.entries()) {
      if (activeSessionId === sessionId) {
        this.activeSessionMap.delete(uid);
      }
    }

    // Delete from database
    this.db.deleteSession(sessionId);

    this.logger.success(`Session closed: ${sessionId}`);

    // Emit session-closed event for room management
    if (userId) {
      this.emit('session-closed', { sessionId, userId });
    }
  }

  /**
   * Close all sessions for user
   * @param {string} userId
   */
  async closeUserSessions(userId) {
    const sessions = this.db.getUserSessions(userId);

    for (const session of sessions) {
      await this.closeSession(session.sessionId);
    }

    this.activeSessionMap.delete(userId);

    this.logger.info(`All sessions closed for user ${userId}`);
  }

  /**
   * Clear session conversation history
   * Restart spawner to reset Claude context
   * @param {string} sessionId
   */
  async clearSessionHistory(sessionId) {
    this.logger.info(`Clearing history for session ${sessionId}`);

    const session = this.db.getSessionById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.state !== 'PROJECT_SELECTED') {
      throw new Error('Cannot clear history - no project selected');
    }

    // Get existing spawner
    const oldSpawner = this.spawners.get(sessionId);

    if (oldSpawner) {
      // Close old spawner
      await oldSpawner.closeAll();
    }

    // Create fresh spawner
    const newSpawner = new DirectClaudeSpawner({
      projectPath: session.projectPath,
      sessionId: sessionId
    });

    // Setup event handlers
    this.setupSpawnerEvents(newSpawner, sessionId, session.userId);

    // Replace spawner
    this.spawners.set(sessionId, newSpawner);

    // Clear response buffer
    this.responseBuffers.delete(sessionId);

    this.logger.success(`Session history cleared: ${sessionId}`);
  }

  /**
   * Get session status
   * @param {string} sessionId
   * @returns {Object}
   */
  getSessionStatus(sessionId) {
    const session = this.db.getSessionById(sessionId);

    if (!session) {
      return { exists: false };
    }

    const spawner = this.spawners.get(sessionId);

    return {
      exists: true,
      session,
      hasSpawner: !!spawner,
      spawnerSessions: spawner ? spawner.getAllSessions() : []
    };
  }

  /**
   * Cleanup old inactive sessions
   * @param {number} days - Days of inactivity
   */
  async cleanupOldSessions(days = 30) {
    const count = this.db.cleanupOldSessions(days);
    this.logger.info(`Cleaned up ${count} old sessions`);
    return count;
  }

  /**
   * Get all sessions from database
   * @returns {Array} Array of all sessions
   */
  getAllSessions() {
    return this.db.getAllSessions();
  }

  /**
   * Get total session count
   * @returns {number} Total sessions
   */
  getTotalSessions() {
    const sessions = this.db.getAllSessions();
    return sessions ? sessions.length : 0;
  }

  /**
   * Get active sessions
   * @returns {Array} Array of active sessions
   */
  getActiveSessions() {
    return Array.from(this.activeSessionMap.entries()).map(([userId, sessionId]) => {
      const session = this.db.getSessionById(sessionId);
      return { userId, sessionId, session };
    }).filter(item => item.session !== null);
  }

  /**
   * Get session by ID (alias for db method)
   * @param {string} sessionId
   * @returns {Object|null} Session object or null
   */
  getSession(sessionId) {
    return this.db.getSessionById(sessionId);
  }

  /**
   * Close all sessions and database
   */
  async shutdown() {
    this.logger.info('Shutting down SessionManager...');

    // Close all spawners
    for (const [sessionId, spawner] of this.spawners.entries()) {
      await spawner.closeAll();
    }

    this.spawners.clear();
    this.executors.clear();
    this.responseBuffers.clear();
    this.activeSessionMap.clear();

    // Close database
    this.db.close();

    this.logger.success('SessionManager shut down');
  }
}

export default SessionManager;
