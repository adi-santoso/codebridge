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
import fs from 'fs';
import path from 'path';
import { DirectClaudeSpawner } from './direct-spawner.js';
import { SessionDatabase } from '../database/session-db.js';
import { ToolExecutor } from '../tools/executor.js';
import { Logger } from '../utils/logger.js';
import { matchesPattern } from '../utils/ignore-matcher.js';

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

    // Shutdown flag
    this.isShuttingDown = false;

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

          // Create Claude spawner
          const spawner = new DirectClaudeSpawner({
            projectPath: session.projectPath,
            sessionId: session.sessionId
          });

          // Setup event handlers
          this.setupSpawnerEvents(spawner, session.sessionId, session.userId);

          // Store spawner
          this.spawners.set(session.sessionId, spawner);

          // NOTE: Do NOT spawn subprocess here! It will be spawned lazily
          // on first message with correct projectPath from spawner.

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

    // Get user's response mode preference
    const session = this.db.getSessionById(sessionId);
    const responseMode = this.db.getUserPreference(session.userId, 'responseMode') || 'balanced';

    // Create DirectClaudeSpawner for this session
    const spawner = new DirectClaudeSpawner({
      projectPath,
      responseMode // Pass response mode to spawner
    });

    // Setup event handlers
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

    // Output chunk streaming (for Discord real-time updates)
    spawner.on('output-chunk', ({ userId, chunk, type }) => {
      this.emit('output-chunk', {
        sessionId,
        userId,
        chunk,
        type
      });
    });

    // Tool use - execute tool and send result back
    spawner.on('tool-use', async ({ userId, tool }) => {
      this.logger.info(`[${sessionId}] Tool use: ${tool.name}`);

      // Check if shutting down
      if (this.isShuttingDown) {
        this.logger.warn(`[${sessionId}] Ignoring tool use during shutdown: ${tool.name}`);
        return;
      }

      try {
        const executor = this.executors.get(sessionId);

        // Double check executor exists (session might be destroyed)
        if (!executor) {
          this.logger.error(`[${sessionId}] No executor found for session`);
          return;
        }

        const result = await executor.execute(tool);

        // Send tool result back to Claude (check if session still exists)
        try {
          spawner.sendToolResult(userId, tool.id, result.content, result.isError);
        } catch (sendError) {
          this.logger.error(`[${sessionId}] Failed to send tool result: ${sendError.message}`);
          return; // Session already closed, skip buffer update
        }

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

        // Only send error back if not shutting down
        if (!this.isShuttingDown) {
          // Send error back to Claude (wrap in try-catch)
          try {
            spawner.sendToolResult(userId, tool.id, `Tool execution error: ${error.message}`, true);
          } catch (sendError) {
            this.logger.error(`[${sessionId}] Failed to send error result: ${sendError.message}`);
          }
        }
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

    this.logger.debug(`[sendPrompt] sessionId: ${sessionId}, userId: ${userId}`);
    this.logger.debug(`[sendPrompt] spawner.projectPath: ${spawner.projectPath}`);
    this.logger.debug(`[sendPrompt] spawner.sessions.size: ${spawner.sessions.size}`);
    this.logger.debug(`[sendPrompt] spawner.sessions.has(${userId}): ${spawner.sessions.has(userId)}`);

    // Initialize response buffer
    this.responseBuffers.set(sessionId, { text: '', toolResults: [] });

    // Create or get Claude session
    let claudeSession = spawner.sessions.get(userId);
    if (!claudeSession) {
      this.logger.info(`[sendPrompt] Creating new Claude session for user ${userId}`);
      claudeSession = await spawner.createSession(userId);
    } else {
      this.logger.info(`[sendPrompt] Reusing existing Claude session for user ${userId}`);
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
   * Set response mode for user's active session (Phase 4)
   * @param {string} userId
   * @param {string} mode - 'brief', 'balanced', 'detailed', 'code-only', 'explain-only'
   */
  setResponseMode(userId, mode) {
    const session = this.getActiveSession(userId);
    if (!session) {
      throw new Error('No active session');
    }

    // Get spawner
    const spawner = this.spawners.get(session.sessionId);

    if (spawner && typeof spawner.setResponseMode === 'function') {
      spawner.setResponseMode(mode);
      this.logger.info(`Response mode set to "${mode}" for session ${session.sessionId}`);
    } else {
      // Spawner doesn't support dynamic mode updates
      // Mode will apply on next spawner restart (e.g., after /reset)
      this.logger.warn(`Spawner for session ${session.sessionId} does not support dynamic response mode updates. Mode will apply after session restart.`);
    }
  }

  /**
   * Get current response mode for user (Phase 4)
   * @param {string} userId
   * @returns {string} Current response mode
   */
  getResponseMode(userId) {
    const session = this.getActiveSession(userId);
    if (!session) {
      return 'balanced';
    }

    const spawner = this.spawners.get(session.sessionId);
    if (spawner && spawner.responseMode) {
      return spawner.responseMode;
    }

    // Fall back to database preference
    return this.db.getUserPreference(userId, 'responseMode') || 'balanced';
  }

  /**
   * Get session snapshot for saving (Phase 2)
   * @param {string} userId
   * @returns {Object} Snapshot object
   */
  getSessionSnapshot(userId) {
    const session = this.getActiveSession(userId);

    if (!session) {
      throw new Error('No active session to snapshot');
    }

    if (session.state !== 'PROJECT_SELECTED') {
      throw new Error('Cannot snapshot session without project selected');
    }

    // Get spawner to extract conversation history
    const spawner = this.spawners.get(session.sessionId);
    const messages = [];

    if (spawner) {
      // Extract conversation from spawner
      // Note: DirectClaudeSpawner doesn't store full conversation history
      // This is a limitation we need to document
      const claudeSession = spawner.sessions.get(userId);
      if (claudeSession) {
        // We can only capture metadata, not full history
        // This is because Claude CLI doesn't expose conversation buffer
        this.logger.warn('Conversation history not available - only metadata will be saved');
      }
    }

    const now = Date.now();

    return {
      sessionId: session.sessionId,
      userId: session.userId,
      projectPath: session.projectPath,
      projectName: session.projectPath ? session.projectPath.split('/').pop() : null,
      state: session.state,
      messages: messages, // Empty - limitation of DirectClaudeSpawner
      metadata: {
        createdAt: session.createdAt,
        lastActive: session.lastActive,
        messageCount: 0, // We don't track this
        savedAt: now
      }
    };
  }

  /**
   * Restore session from snapshot (Phase 2)
   * @param {string} userId
   * @param {object} snapshot - Session snapshot
   * @returns {Object} Restored session
   */
  async restoreSessionFromSnapshot(userId, snapshot) {
    this.logger.info(`Restoring session from snapshot for user ${userId}`);

    // Close current session if exists
    const currentSession = this.getActiveSession(userId);
    if (currentSession) {
      await this.closeSession(currentSession.sessionId);
    }

    // Create new session
    const newSession = this.createSession(userId);

    // Set project
    if (snapshot.projectPath) {
      this.setSessionProject(newSession.sessionId, snapshot.projectPath);
    }

    // Note: We cannot restore conversation history
    // because DirectClaudeSpawner doesn't support it
    // This is documented in user docs

    this.logger.success(`Session restored: ${newSession.sessionId}`);

    return newSession;
  }

  /**
   * Set working directory for session (Phase 7)
   * @param {string} userId
   * @param {string} relativePath - Path relative to project root
   */
  setWorkingDirectory(userId, relativePath) {
    const session = this.getActiveSession(userId);
    if (!session) {
      throw new Error('No active session');
    }

    if (session.state !== 'PROJECT_SELECTED') {
      throw new Error('No project selected');
    }

    // Resolve path relative to project
    const absolutePath = path.resolve(session.projectPath, relativePath);

    // Security: ensure it's within project
    if (!absolutePath.startsWith(session.projectPath)) {
      throw new Error('Path must be within project directory');
    }

    // Check it exists and is a directory
    if (!fs.existsSync(absolutePath)) {
      throw new Error('Directory does not exist');
    }

    if (!fs.statSync(absolutePath).isDirectory()) {
      throw new Error('Path is not a directory');
    }

    // Update session (store in database)
    const persistEnabled = process.env.CONTEXT_PERSIST_TO_DB === 'true';
    if (persistEnabled) {
      this.db.saveSessionContext(userId, session.sessionId, 'workdir', relativePath, null);
    }

    // Update in-memory cache (we need to extend the session object)
    // For now, we'll store it in the database and retrieve it when needed
    this.logger.info(`Working directory set for user ${userId}: ${relativePath}`);
  }

  /**
   * Get working directory for session (Phase 7)
   * @param {string} userId
   * @returns {string} Absolute path to working directory
   */
  getWorkingDirectory(userId) {
    const session = this.getActiveSession(userId);
    if (!session) {
      throw new Error('No active session');
    }

    if (session.state !== 'PROJECT_SELECTED') {
      throw new Error('No project selected');
    }

    // Get from database
    const persistEnabled = process.env.CONTEXT_PERSIST_TO_DB === 'true';
    if (persistEnabled) {
      const contexts = this.db.getSessionContext(userId, session.sessionId, 'workdir');
      if (contexts && contexts.length > 0) {
        const relativePath = contexts[0].contextValue;
        return path.resolve(session.projectPath, relativePath);
      }
    }

    // Default: project root
    return session.projectPath;
  }

  /**
   * Add context file (Phase 7)
   * @param {string} userId
   * @param {string} filePath - Path relative to working directory or project
   * @returns {Object} File object
   */
  async addContextFile(userId, filePath) {
    const session = this.getActiveSession(userId);
    if (!session) {
      throw new Error('No active session');
    }

    if (session.state !== 'PROJECT_SELECTED') {
      throw new Error('No project selected');
    }

    // Resolve path (relative to working directory or project)
    let basePath;
    try {
      basePath = this.getWorkingDirectory(userId);
    } catch {
      basePath = session.projectPath;
    }

    const absolutePath = path.resolve(basePath, filePath);

    // Security check
    if (!absolutePath.startsWith(session.projectPath)) {
      throw new Error('File must be within project directory');
    }

    // Check exists
    if (!fs.existsSync(absolutePath)) {
      throw new Error('File does not exist');
    }

    const stats = fs.statSync(absolutePath);

    // Check if it's a file
    if (!stats.isFile()) {
      throw new Error('Path is not a file');
    }

    // Check size
    const maxSize = parseInt(process.env.CONTEXT_MAX_FILE_SIZE || '102400');
    if (stats.size > maxSize) {
      const formatBytes = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
      };
      throw new Error(`File too large (${formatBytes(stats.size)}). Max: ${formatBytes(maxSize)}`);
    }

    // Check total context size
    const currentContext = this.getContextFiles(userId);
    const totalSize = currentContext.reduce((sum, f) => sum + (f.size || 0), 0) + stats.size;
    const maxTotal = parseInt(process.env.CONTEXT_MAX_TOTAL_SIZE || '1048576');

    if (totalSize > maxTotal) {
      const formatBytes = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
      };
      throw new Error(`Total context size would exceed ${formatBytes(maxTotal)}`);
    }

    // Read file
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const lines = content.split('\n').length;

    // Create context object
    const relativePath = path.relative(session.projectPath, absolutePath);
    const fileObj = {
      path: relativePath,
      absolutePath,
      size: stats.size,
      lines,
      addedAt: Date.now()
    };

    // Save to database
    const persistEnabled = process.env.CONTEXT_PERSIST_TO_DB === 'true';
    if (persistEnabled) {
      this.db.saveSessionContext(
        userId,
        session.sessionId,
        'file',
        relativePath,
        JSON.stringify({ size: stats.size, lines, addedAt: fileObj.addedAt })
      );
    }

    this.logger.info(`Context file added for user ${userId}: ${relativePath}`);

    return fileObj;
  }

  /**
   * Get context files (Phase 7)
   * @param {string} userId
   * @returns {Array<Object>} Array of file objects
   */
  getContextFiles(userId) {
    const session = this.getActiveSession(userId);
    if (!session) {
      return [];
    }

    if (session.state !== 'PROJECT_SELECTED') {
      return [];
    }

    const persistEnabled = process.env.CONTEXT_PERSIST_TO_DB === 'true';
    if (!persistEnabled) {
      return [];
    }

    const contexts = this.db.getSessionContext(userId, session.sessionId, 'file');
    if (!contexts || contexts.length === 0) {
      return [];
    }

    return contexts.map(ctx => {
      const metadata = ctx.metadata ? JSON.parse(ctx.metadata) : {};
      return {
        path: ctx.contextValue,
        absolutePath: path.resolve(session.projectPath, ctx.contextValue),
        size: metadata.size || 0,
        lines: metadata.lines || 0,
        addedAt: metadata.addedAt || ctx.createdAt
      };
    });
  }

  /**
   * Clear all context files (Phase 7)
   * @param {string} userId
   */
  clearContext(userId) {
    const session = this.getActiveSession(userId);
    if (!session) {
      throw new Error('No active session');
    }

    if (session.state !== 'PROJECT_SELECTED') {
      throw new Error('No project selected');
    }

    const persistEnabled = process.env.CONTEXT_PERSIST_TO_DB === 'true';
    if (persistEnabled) {
      this.db.clearSessionContext(userId, session.sessionId, 'file');
    }

    this.logger.info(`Context cleared for user ${userId}`);
  }

  /**
   * Add ignore pattern (Phase 7)
   * @param {string} userId
   * @param {string} pattern - Ignore pattern
   */
  addIgnorePattern(userId, pattern) {
    const session = this.getActiveSession(userId);
    if (!session) {
      throw new Error('No active session');
    }

    if (session.state !== 'PROJECT_SELECTED') {
      throw new Error('No project selected');
    }

    // Validate pattern
    if (!pattern || pattern.trim().length === 0) {
      throw new Error('Invalid pattern');
    }

    const trimmedPattern = pattern.trim();

    // Save to database
    const persistEnabled = process.env.CONTEXT_PERSIST_TO_DB === 'true';
    if (persistEnabled) {
      this.db.saveSessionContext(
        userId,
        session.sessionId,
        'ignore',
        trimmedPattern,
        JSON.stringify({ addedAt: Date.now() })
      );
    }

    this.logger.info(`Ignore pattern added for user ${userId}: ${trimmedPattern}`);
  }

  /**
   * Get ignore patterns (Phase 7)
   * @param {string} userId
   * @returns {Array<Object>} Array of pattern objects
   */
  getIgnorePatterns(userId) {
    const session = this.getActiveSession(userId);
    if (!session) {
      return [];
    }

    if (session.state !== 'PROJECT_SELECTED') {
      return [];
    }

    const persistEnabled = process.env.CONTEXT_PERSIST_TO_DB === 'true';
    if (!persistEnabled) {
      return [];
    }

    const contexts = this.db.getSessionContext(userId, session.sessionId, 'ignore');
    if (!contexts || contexts.length === 0) {
      return [];
    }

    return contexts.map(ctx => {
      const metadata = ctx.metadata ? JSON.parse(ctx.metadata) : {};
      return {
        pattern: ctx.contextValue,
        addedAt: metadata.addedAt || ctx.createdAt
      };
    });
  }

  /**
   * Clear ignore patterns (Phase 7)
   * @param {string} userId
   */
  clearIgnorePatterns(userId) {
    const session = this.getActiveSession(userId);
    if (!session) {
      throw new Error('No active session');
    }

    if (session.state !== 'PROJECT_SELECTED') {
      throw new Error('No project selected');
    }

    const persistEnabled = process.env.CONTEXT_PERSIST_TO_DB === 'true';
    if (persistEnabled) {
      this.db.clearSessionContext(userId, session.sessionId, 'ignore');
    }

    this.logger.info(`Ignore patterns cleared for user ${userId}`);
  }

  /**
   * Check if path is ignored (Phase 7)
   * @param {string} userId
   * @param {string} targetPath - Path to check (relative to project)
   * @returns {boolean} True if path should be ignored
   */
  isPathIgnored(userId, targetPath) {
    const session = this.getActiveSession(userId);
    if (!session) {
      return false;
    }

    // Get user patterns
    const userPatterns = this.getIgnorePatterns(userId).map(p => p.pattern);

    // Get default patterns
    const defaultPatterns = (process.env.IGNORE_DEFAULT_PATTERNS || 'node_modules,dist,.git')
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    // Combine patterns
    const allPatterns = [...defaultPatterns, ...userPatterns];

    if (allPatterns.length === 0) {
      return false;
    }

    // Use matcher from ignore-matcher utility
    return matchesPattern(targetPath, allPatterns);
  }

  /**
   * Close all sessions and database
   */
  async shutdown() {
    this.logger.info('Shutting down SessionManager...');

    // Set shutdown flag to prevent new tool executions
    this.isShuttingDown = true;

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
