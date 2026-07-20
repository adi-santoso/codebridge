import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

/**
 * SessionDatabase - SQLite session persistence
 *
 * Schema:
 * - id: INTEGER PRIMARY KEY AUTOINCREMENT
 * - userId: TEXT (WhatsApp phone number, e.g., '628xxx')
 * - sessionId: TEXT (Auto-generated sess_abc123)
 * - projectPath: TEXT (Absolute path to project)
 * - state: TEXT (NO_SESSION | SESSION_SELECTED | PROJECT_SELECTED)
 * - createdAt: INTEGER (Unix timestamp)
 * - lastActive: INTEGER (Unix timestamp)
 *
 * @class SessionDatabase
 * @example
 * const db = new SessionDatabase({ path: './.codebridge/sessions.db' });
 * const session = db.createSession('628xxx', 'sess_abc123');
 */
export class SessionDatabase {
  /**
   * Create SessionDatabase instance
   * @param {Object} options
   * @param {string} [options.path='./.codebridge/sessions.db'] - Database file path
   */
  constructor(options = {}) {
    const dbPath = options.path || './.codebridge/sessions.db';
    const fullPath = resolve(dbPath);

    // Ensure directory exists
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Open database
    this.db = new Database(fullPath);
    this.db.pragma('journal_mode = WAL'); // Better concurrency

    // Initialize schema
    this.initSchema();
  }

  /**
   * Initialize database schema
   * @private
   */
  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        sessionId TEXT NOT NULL UNIQUE,
        projectPath TEXT,
        state TEXT NOT NULL DEFAULT 'NO_SESSION',
        createdAt INTEGER NOT NULL,
        lastActive INTEGER NOT NULL,
        UNIQUE(userId, sessionId)
      );

      CREATE INDEX IF NOT EXISTS idx_userId ON sessions(userId);
      CREATE INDEX IF NOT EXISTS idx_sessionId ON sessions(sessionId);
      CREATE INDEX IF NOT EXISTS idx_state ON sessions(state);

      -- Command execution history
      CREATE TABLE IF NOT EXISTS command_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        sessionId TEXT,
        command TEXT NOT NULL,
        args TEXT,
        result TEXT,
        success INTEGER DEFAULT 1,
        executedAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_command_userId ON command_history(userId);
      CREATE INDEX IF NOT EXISTS idx_command_sessionId ON command_history(sessionId);
      CREATE INDEX IF NOT EXISTS idx_command_executedAt ON command_history(executedAt);

      -- User preferences
      CREATE TABLE IF NOT EXISTS user_preferences (
        userId TEXT PRIMARY KEY,
        responseMode TEXT DEFAULT 'balanced',
        debugMode INTEGER DEFAULT 0,
        workingDirectory TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );

      -- Saved session snapshots (Phase 2)
      CREATE TABLE IF NOT EXISTS saved_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        sessionId TEXT NOT NULL,
        name TEXT NOT NULL,
        snapshot TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        UNIQUE(userId, name)
      );

      CREATE INDEX IF NOT EXISTS idx_saved_sessions_user ON saved_sessions(userId);
      CREATE INDEX IF NOT EXISTS idx_saved_sessions_name ON saved_sessions(userId, name);

      -- Tool execution audit log (Phase 3)
      CREATE TABLE IF NOT EXISTS tool_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        sessionId TEXT NOT NULL,
        toolName TEXT NOT NULL,
        parameters TEXT,
        result TEXT,
        status TEXT NOT NULL,
        errorMessage TEXT,
        executedAt INTEGER NOT NULL,
        duration INTEGER,
        cancelledBy TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tool_audit_user ON tool_audit(userId);
      CREATE INDEX IF NOT EXISTS idx_tool_audit_session ON tool_audit(sessionId);
      CREATE INDEX IF NOT EXISTS idx_tool_audit_tool ON tool_audit(toolName);
      CREATE INDEX IF NOT EXISTS idx_tool_audit_status ON tool_audit(status);
      CREATE INDEX IF NOT EXISTS idx_tool_audit_executedAt ON tool_audit(executedAt);

      -- Tool permissions (whitelist/blacklist) (Phase 3)
      CREATE TABLE IF NOT EXISTS tool_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        toolName TEXT NOT NULL,
        permission TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        UNIQUE(userId, toolName)
      );

      CREATE INDEX IF NOT EXISTS idx_tool_permissions_user ON tool_permissions(userId);

      -- Error history (Phase 6)
      CREATE TABLE IF NOT EXISTS error_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        sessionId TEXT NOT NULL,
        errorType TEXT NOT NULL,
        errorMessage TEXT NOT NULL,
        stackTrace TEXT,
        context TEXT,
        occurredAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_error_user_session ON error_history(userId, sessionId);
      CREATE INDEX IF NOT EXISTS idx_error_occurred ON error_history(occurredAt);

      -- Session context (Phase 7)
      CREATE TABLE IF NOT EXISTS session_context (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        sessionId TEXT NOT NULL,
        contextType TEXT NOT NULL,
        contextValue TEXT NOT NULL,
        metadata TEXT,
        createdAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_session_context ON session_context(userId, sessionId, contextType);

      -- Admin users table (Phase 9)
      CREATE TABLE IF NOT EXISTS admin_users (
        userId TEXT PRIMARY KEY,
        role TEXT NOT NULL DEFAULT 'user',
        addedBy TEXT,
        addedAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_admin_role ON admin_users(role);

      -- Whitelist table (Phase 9)
      CREATE TABLE IF NOT EXISTS whitelist (
        phoneNumber TEXT PRIMARY KEY,
        addedBy TEXT,
        addedAt INTEGER NOT NULL,
        notes TEXT
      );

      -- Audit log table (Phase 9)
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        details TEXT,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(userId);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    `);
  }

  /**
   * Create new session
   * @param {string} userId - User identifier (WhatsApp phone)
   * @param {string} sessionId - Auto-generated session ID (sess_abc123)
   * @returns {Object} Created session
   */
  createSession(userId, sessionId) {
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO sessions (userId, sessionId, projectPath, state, createdAt, lastActive)
      VALUES (?, ?, NULL, 'SESSION_SELECTED', ?, ?)
    `);

    const result = stmt.run(userId, sessionId, now, now);

    return this.getSessionById(sessionId);
  }

  /**
   * Get session by sessionId
   * @param {string} sessionId
   * @returns {Object|null}
   */
  getSessionById(sessionId) {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE sessionId = ?');
    return stmt.get(sessionId);
  }

  /**
   * Get all sessions for a user
   * @param {string} userId
   * @returns {Array<Object>}
   */
  getUserSessions(userId) {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE userId = ? ORDER BY lastActive DESC');
    return stmt.all(userId);
  }

  /**
   * Get active session for a user (most recently active)
   * @param {string} userId
   * @returns {Object|null}
   */
  getActiveSession(userId) {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      WHERE userId = ?
      ORDER BY lastActive DESC
      LIMIT 1
    `);
    return stmt.get(userId);
  }

  /**
   * Update session project path and state
   * @param {string} sessionId
   * @param {string} projectPath
   */
  setSessionProject(sessionId, projectPath) {
    const now = Date.now();

    const stmt = this.db.prepare(`
      UPDATE sessions
      SET projectPath = ?, state = 'PROJECT_SELECTED', lastActive = ?
      WHERE sessionId = ?
    `);

    stmt.run(projectPath, now, sessionId);
  }

  /**
   * Update session state
   * @param {string} sessionId
   * @param {string} state - NO_SESSION | SESSION_SELECTED | PROJECT_SELECTED
   */
  setSessionState(sessionId, state) {
    const now = Date.now();

    const stmt = this.db.prepare(`
      UPDATE sessions
      SET state = ?, lastActive = ?
      WHERE sessionId = ?
    `);

    stmt.run(state, now, sessionId);
  }

  /**
   * Update lastActive timestamp
   * @param {string} sessionId
   */
  touchSession(sessionId) {
    const now = Date.now();

    const stmt = this.db.prepare(`
      UPDATE sessions
      SET lastActive = ?
      WHERE sessionId = ?
    `);

    stmt.run(now, sessionId);
  }

  /**
   * Delete session
   * @param {string} sessionId
   */
  deleteSession(sessionId) {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE sessionId = ?');
    stmt.run(sessionId);
  }

  /**
   * Delete all sessions for a user
   * @param {string} userId
   */
  deleteUserSessions(userId) {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE userId = ?');
    stmt.run(userId);
  }

  /**
   * Get all sessions with PROJECT_SELECTED state
   * @returns {Array<Object>}
   */
  getActiveSessions() {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      WHERE state = 'PROJECT_SELECTED'
      ORDER BY lastActive DESC
    `);
    return stmt.all();
  }

  /**
   * Get all sessions (regardless of state)
   * @returns {Array<Object>}
   */
  getAllSessions() {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      ORDER BY lastActive DESC
    `);
    return stmt.all();
  }

  /**
   * Count sessions by state
   * @returns {Object} { NO_SESSION: 0, SESSION_SELECTED: 1, PROJECT_SELECTED: 2 }
   */
  getSessionStats() {
    const stmt = this.db.prepare(`
      SELECT state, COUNT(*) as count
      FROM sessions
      GROUP BY state
    `);

    const rows = stmt.all();
    const stats = {
      NO_SESSION: 0,
      SESSION_SELECTED: 0,
      PROJECT_SELECTED: 0
    };

    rows.forEach(row => {
      stats[row.state] = row.count;
    });

    return stats;
  }

  /**
   * Clean up old inactive sessions (older than N days)
   * @param {number} days - Days of inactivity
   * @returns {number} Number of deleted sessions
   */
  cleanupOldSessions(days = 30) {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

    const stmt = this.db.prepare(`
      DELETE FROM sessions
      WHERE lastActive < ?
    `);

    const result = stmt.run(cutoff);
    return result.changes;
  }

  /**
   * Check if session exists
   * @param {string} sessionId
   * @returns {boolean}
   */
  sessionExists(sessionId) {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM sessions WHERE sessionId = ?');
    const result = stmt.get(sessionId);
    return result.count > 0;
  }

  /**
   * Generate unique session ID
   * @returns {string} sess_abc123 format
   */
  generateSessionId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id;
    let attempts = 0;

    do {
      id = 'sess_';
      for (let i = 0; i < 6; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
      }
      attempts++;

      if (attempts > 100) {
        throw new Error('Failed to generate unique session ID after 100 attempts');
      }
    } while (this.sessionExists(id));

    return id;
  }

  /**
   * Insert command history entry
   * @param {Object} data
   * @param {string} data.userId
   * @param {string} [data.sessionId]
   * @param {string} data.command
   * @param {string} [data.args]
   * @param {string} [data.result]
   * @param {boolean} data.success
   * @param {number} data.executedAt
   */
  insertCommandHistory(data) {
    const stmt = this.db.prepare(`
      INSERT INTO command_history (userId, sessionId, command, args, result, success, executedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.userId,
      data.sessionId || null,
      data.command,
      data.args || null,
      data.result || null,
      data.success ? 1 : 0,
      data.executedAt
    );
  }

  /**
   * Get command history for a user with pagination support
   * @param {string} userId
   * @param {number} [limit=50] - Maximum number of results to return
   * @param {number} [offset=0] - Number of results to skip
   * @returns {Array<Object>}
   */
  getCommandHistory(userId, limit = 50, offset = 0) {
    const stmt = this.db.prepare(`
      SELECT * FROM command_history
      WHERE userId = ?
      ORDER BY executedAt DESC
      LIMIT ? OFFSET ?
    `);

    return stmt.all(userId, limit, offset);
  }

  /**
   * Get command history count for a user
   * @param {string} userId
   * @returns {number}
   */
  getCommandHistoryCount(userId) {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM command_history
      WHERE userId = ?
    `);

    const result = stmt.get(userId);
    return result.count;
  }

  /**
   * Clean up old command history (older than N days)
   * @param {number} days
   * @returns {number} Number of deleted entries
   */
  cleanupOldCommandHistory(days = 30) {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

    const stmt = this.db.prepare(`
      DELETE FROM command_history
      WHERE executedAt < ?
    `);

    const result = stmt.run(cutoff);
    return result.changes;
  }

  /**
   * Get user preferences
   * @param {string} userId
   * @returns {Object|null}
   */
  getUserPreferences(userId) {
    const stmt = this.db.prepare('SELECT * FROM user_preferences WHERE userId = ?');
    return stmt.get(userId);
  }

  /**
   * Set user preferences
   * @param {string} userId
   * @param {Object} preferences
   */
  setUserPreferences(userId, preferences) {
    const existing = this.getUserPreferences(userId);
    const now = Date.now();

    if (existing) {
      // Update existing
      const updates = [];
      const values = [];

      if (preferences.responseMode !== undefined) {
        updates.push('responseMode = ?');
        values.push(preferences.responseMode);
      }

      if (preferences.debugMode !== undefined) {
        updates.push('debugMode = ?');
        values.push(preferences.debugMode ? 1 : 0);
      }

      if (preferences.workingDirectory !== undefined) {
        updates.push('workingDirectory = ?');
        values.push(preferences.workingDirectory);
      }

      updates.push('updatedAt = ?');
      values.push(now);

      values.push(userId);

      const stmt = this.db.prepare(`
        UPDATE user_preferences
        SET ${updates.join(', ')}
        WHERE userId = ?
      `);

      stmt.run(...values);
    } else {
      // Insert new
      const stmt = this.db.prepare(`
        INSERT INTO user_preferences (userId, responseMode, debugMode, workingDirectory, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        userId,
        preferences.responseMode || 'balanced',
        preferences.debugMode ? 1 : 0,
        preferences.workingDirectory || null,
        now,
        now
      );
    }
  }

  /**
   * Save session snapshot (Phase 2)
   * @param {string} userId
   * @param {string} sessionId
   * @param {string} name - Unique name for saved session
   * @param {object} snapshot - Session state object
   * @returns {number} Saved session ID
   */
  saveSessionSnapshot(userId, sessionId, name, snapshot) {
    const now = Date.now();

    // Check if name already exists for this user
    const existing = this.getSavedSession(userId, name);
    if (existing) {
      throw new Error(`Saved session with name "${name}" already exists. Use /delete first or choose a different name.`);
    }

    // Check max saved sessions
    const count = this.getSavedSessionCount(userId);
    const maxSaved = parseInt(process.env.SESSION_MAX_SAVED || '10');
    if (count >= maxSaved) {
      throw new Error(`Maximum saved sessions (${maxSaved}) reached. Delete some sessions first.`);
    }

    const stmt = this.db.prepare(`
      INSERT INTO saved_sessions (userId, sessionId, name, snapshot, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(userId, sessionId, name, JSON.stringify(snapshot), now);
    return result.lastInsertRowid;
  }

  /**
   * Get saved sessions for a user (Phase 2)
   * @param {string} userId
   * @param {number} [limit=50] - Max results
   * @param {number} [offset=0] - Offset for pagination
   * @returns {Array<Object>}
   */
  getSavedSessions(userId, limit = 50, offset = 0) {
    const stmt = this.db.prepare(`
      SELECT id, userId, sessionId, name, createdAt,
             length(snapshot) as snapshotSize
      FROM saved_sessions
      WHERE userId = ?
      ORDER BY createdAt DESC
      LIMIT ? OFFSET ?
    `);

    return stmt.all(userId, limit, offset);
  }

  /**
   * Get specific saved session (Phase 2)
   * @param {string} userId
   * @param {string} name
   * @returns {Object|null}
   */
  getSavedSession(userId, name) {
    const stmt = this.db.prepare(`
      SELECT * FROM saved_sessions
      WHERE userId = ? AND name = ?
    `);

    return stmt.get(userId, name);
  }

  /**
   * Delete saved session (Phase 2)
   * @param {string} userId
   * @param {string} name
   * @returns {boolean} True if deleted
   */
  deleteSavedSession(userId, name) {
    const stmt = this.db.prepare(`
      DELETE FROM saved_sessions
      WHERE userId = ? AND name = ?
    `);

    const result = stmt.run(userId, name);
    return result.changes > 0;
  }

  /**
   * Get count of saved sessions for user (Phase 2)
   * @param {string} userId
   * @returns {number}
   */
  getSavedSessionCount(userId) {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM saved_sessions
      WHERE userId = ?
    `);

    const result = stmt.get(userId);
    return result.count;
  }

  /**
   * Log tool execution (Phase 3)
   * @param {string} userId
   * @param {string} sessionId
   * @param {string} toolName
   * @param {object} params - Tool parameters
   * @param {object} result - Tool result
   * @param {string} status - 'success', 'error', 'cancelled'
   * @param {number} duration - Execution duration in ms
   * @param {string} [errorMessage] - Error message if failed
   * @param {string} [cancelledBy] - User who cancelled (if applicable)
   * @returns {number} Inserted row ID
   */
  logToolExecution(userId, sessionId, toolName, params, result, status, duration, errorMessage = null, cancelledBy = null) {
    const now = Date.now();

    // Sanitize and truncate large data
    const maxParamSize = 50000; // 50KB for parameters
    const maxResultSize = parseInt(process.env.TOOL_AUDIT_LOG_RESULTS === 'true' ? '100000' : '1000'); // 100KB or 1KB

    let paramsStr = null;
    let resultStr = null;

    try {
      if (params && process.env.TOOL_AUDIT_LOG_PARAMS !== 'false') {
        paramsStr = JSON.stringify(params);
        if (paramsStr.length > maxParamSize) {
          paramsStr = paramsStr.substring(0, maxParamSize) + '... [TRUNCATED]';
        }
      }

      if (result && process.env.TOOL_AUDIT_LOG_RESULTS === 'true') {
        resultStr = JSON.stringify(result);
        if (resultStr.length > maxResultSize) {
          resultStr = resultStr.substring(0, maxResultSize) + '... [TRUNCATED]';
        }
      }
    } catch (err) {
      // Ignore JSON stringify errors
    }

    const stmt = this.db.prepare(`
      INSERT INTO tool_audit (userId, sessionId, toolName, parameters, result, status, errorMessage, executedAt, duration, cancelledBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertResult = stmt.run(
      userId,
      sessionId,
      toolName,
      paramsStr,
      resultStr,
      status,
      errorMessage,
      now,
      duration,
      cancelledBy
    );

    // Clean up old entries if exceeding max
    this.cleanupToolAuditLog(userId);

    return insertResult.lastInsertRowid;
  }

  /**
   * Get tool audit log for a user (Phase 3)
   * @param {string} userId
   * @param {number} [limit=50] - Maximum number of results
   * @param {number} [offset=0] - Number of results to skip
   * @param {object} [filters={}] - Optional filters { toolName, status, sessionId }
   * @returns {Array<Object>}
   */
  getToolAuditLog(userId, limit = 50, offset = 0, filters = {}) {
    let query = `SELECT * FROM tool_audit WHERE userId = ?`;
    const params = [userId];

    // Apply filters
    if (filters.toolName) {
      query += ` AND toolName = ?`;
      params.push(filters.toolName);
    }

    if (filters.status) {
      query += ` AND status = ?`;
      params.push(filters.status);
    }

    if (filters.sessionId) {
      query += ` AND sessionId = ?`;
      params.push(filters.sessionId);
    }

    query += ` ORDER BY executedAt DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Get tool audit log count (Phase 3)
   * @param {string} userId
   * @param {object} [filters={}] - Optional filters
   * @returns {number}
   */
  getToolAuditCount(userId, filters = {}) {
    let query = `SELECT COUNT(*) as count FROM tool_audit WHERE userId = ?`;
    const params = [userId];

    if (filters.toolName) {
      query += ` AND toolName = ?`;
      params.push(filters.toolName);
    }

    if (filters.status) {
      query += ` AND status = ?`;
      params.push(filters.status);
    }

    if (filters.sessionId) {
      query += ` AND sessionId = ?`;
      params.push(filters.sessionId);
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params);
    return result.count;
  }

  /**
   * Get tool usage statistics for a user (Phase 3)
   * @param {string} userId
   * @returns {Array<Object>} Array of { toolName, count, lastUsed }
   */
  getToolStats(userId) {
    const stmt = this.db.prepare(`
      SELECT
        toolName,
        COUNT(*) as count,
        MAX(executedAt) as lastUsed,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successCount,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errorCount,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelledCount,
        AVG(duration) as avgDuration
      FROM tool_audit
      WHERE userId = ?
      GROUP BY toolName
      ORDER BY count DESC
    `);

    return stmt.all(userId);
  }

  /**
   * Clean up old tool audit entries (Phase 3)
   * Keeps only the latest N entries per user
   * @param {string} userId
   * @returns {number} Number of deleted entries
   */
  cleanupToolAuditLog(userId) {
    const maxEntries = parseInt(process.env.TOOL_AUDIT_MAX_ENTRIES || '1000');

    const stmt = this.db.prepare(`
      DELETE FROM tool_audit
      WHERE userId = ?
      AND id NOT IN (
        SELECT id FROM tool_audit
        WHERE userId = ?
        ORDER BY executedAt DESC
        LIMIT ?
      )
    `);

    const result = stmt.run(userId, userId, maxEntries);
    return result.changes;
  }

  /**
   * Set tool permission for user (Phase 3)
   * @param {string} userId
   * @param {string} toolName
   * @param {string} permission - 'allow' or 'deny'
   */
  setToolPermission(userId, toolName, permission) {
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO tool_permissions (userId, toolName, permission, createdAt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(userId, toolName) DO UPDATE SET
        permission = excluded.permission,
        createdAt = excluded.createdAt
    `);

    stmt.run(userId, toolName, permission, now);
  }

  /**
   * Get tool permissions for user (Phase 3)
   * @param {string} userId
   * @returns {Array<Object>} Array of { toolName, permission }
   */
  getToolPermissions(userId) {
    const stmt = this.db.prepare(`
      SELECT toolName, permission, createdAt
      FROM tool_permissions
      WHERE userId = ?
      ORDER BY createdAt DESC
    `);

    return stmt.all(userId);
  }

  /**
   * Remove tool permission for user (Phase 3)
   * @param {string} userId
   * @param {string} toolName
   * @returns {boolean} True if removed
   */
  removeToolPermission(userId, toolName) {
    const stmt = this.db.prepare(`
      DELETE FROM tool_permissions
      WHERE userId = ? AND toolName = ?
    `);

    const result = stmt.run(userId, toolName);
    return result.changes > 0;
  }

  /**
   * Check if tool is allowed for user (Phase 3)
   * @param {string} userId
   * @param {string} toolName
   * @returns {boolean|null} true (allowed), false (denied), null (no explicit permission)
   */
  isToolAllowed(userId, toolName) {
    const stmt = this.db.prepare(`
      SELECT permission FROM tool_permissions
      WHERE userId = ? AND toolName = ?
    `);

    const result = stmt.get(userId, toolName);

    if (!result) {
      return null; // No explicit permission set
    }

    return result.permission === 'allow';
  }

  /**
   * Get last tool execution for user (Phase 3)
   * Used for retry functionality
   * @param {string} userId
   * @param {string} [sessionId] - Optional session filter
   * @returns {Object|null}
   */
  getLastToolExecution(userId, sessionId = null) {
    let query = `
      SELECT * FROM tool_audit
      WHERE userId = ?
    `;
    const params = [userId];

    if (sessionId) {
      query += ` AND sessionId = ?`;
      params.push(sessionId);
    }

    query += ` ORDER BY executedAt DESC LIMIT 1`;

    const stmt = this.db.prepare(query);
    return stmt.get(...params);
  }

  /**
   * Log error to history (Phase 6)
   * @param {string} userId
   * @param {string} sessionId
   * @param {string} errorType - Error category (COMMAND_ERROR, TOOL_ERROR, etc.)
   * @param {string} errorMessage - Human-readable error message
   * @param {string} [stackTrace] - Stack trace if available
   * @param {object} [context] - Additional context (command, args, etc.)
   * @returns {number} Inserted row ID
   */
  logError(userId, sessionId, errorType, errorMessage, stackTrace = null, context = null) {
    const now = Date.now();

    // Truncate large data
    const maxMessageSize = 5000;
    const maxStackSize = 10000;

    let truncatedMessage = errorMessage;
    if (truncatedMessage && truncatedMessage.length > maxMessageSize) {
      truncatedMessage = truncatedMessage.substring(0, maxMessageSize) + '... [TRUNCATED]';
    }

    let truncatedStack = stackTrace;
    if (truncatedStack && truncatedStack.length > maxStackSize) {
      truncatedStack = truncatedStack.substring(0, maxStackSize) + '... [TRUNCATED]';
    }

    let contextStr = null;
    if (context) {
      try {
        contextStr = JSON.stringify(context);
      } catch (err) {
        contextStr = String(context);
      }
    }

    const stmt = this.db.prepare(`
      INSERT INTO error_history (userId, sessionId, errorType, errorMessage, stackTrace, context, occurredAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      userId,
      sessionId,
      errorType,
      truncatedMessage,
      truncatedStack,
      contextStr,
      now
    );

    // Clean up old entries
    this.cleanupErrorHistory(userId);

    return result.lastInsertRowid;
  }

  /**
   * Get error history for user (Phase 6)
   * @param {string} userId
   * @param {number} [limit=50] - Maximum number of results
   * @param {number} [offset=0] - Number of results to skip
   * @param {object} [filters={}] - Optional filters { errorType, sessionId }
   * @returns {Array<Object>}
   */
  getErrorHistory(userId, limit = 50, offset = 0, filters = {}) {
    let query = `SELECT * FROM error_history WHERE userId = ?`;
    const params = [userId];

    // Apply filters
    if (filters.errorType) {
      query += ` AND errorType = ?`;
      params.push(filters.errorType);
    }

    if (filters.sessionId) {
      query += ` AND sessionId = ?`;
      params.push(filters.sessionId);
    }

    query += ` ORDER BY occurredAt DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Get error count for user (Phase 6)
   * @param {string} userId
   * @param {object} [filters={}] - Optional filters
   * @returns {number}
   */
  getErrorCount(userId, filters = {}) {
    let query = `SELECT COUNT(*) as count FROM error_history WHERE userId = ?`;
    const params = [userId];

    if (filters.errorType) {
      query += ` AND errorType = ?`;
      params.push(filters.errorType);
    }

    if (filters.sessionId) {
      query += ` AND sessionId = ?`;
      params.push(filters.sessionId);
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params);
    return result.count;
  }

  /**
   * Clean up old error history (Phase 6)
   * Keeps only the latest N entries per user
   * @param {string} userId
   * @returns {number} Number of deleted entries
   */
  cleanupErrorHistory(userId) {
    const maxEntries = parseInt(process.env.ERROR_HISTORY_MAX_ENTRIES || '500');

    const stmt = this.db.prepare(`
      DELETE FROM error_history
      WHERE userId = ?
      AND id NOT IN (
        SELECT id FROM error_history
        WHERE userId = ?
        ORDER BY occurredAt DESC
        LIMIT ?
      )
    `);

    const result = stmt.run(userId, userId, maxEntries);
    return result.changes;
  }

  /**
   * Set user preference (Phase 6)
   * @param {string} userId
   * @param {string} key - Preference key (debugMode, responseMode, etc.)
   * @param {any} value - Preference value
   */
  setUserPreference(userId, key, value) {
    const now = Date.now();

    // Get existing preferences
    const existing = this.getUserPreferences(userId);

    if (existing) {
      // Update existing
      const updates = [key];
      const values = [value];

      // Handle boolean conversion
      if (typeof value === 'boolean') {
        values[0] = value ? 1 : 0;
      }

      updates.push('updatedAt');
      values.push(now);
      values.push(userId);

      const stmt = this.db.prepare(`
        UPDATE user_preferences
        SET ${key} = ?, updatedAt = ?
        WHERE userId = ?
      `);

      stmt.run(...values);
    } else {
      // Insert new with defaults
      const prefs = {
        responseMode: 'balanced',
        debugMode: false,
        workingDirectory: null
      };

      prefs[key] = value;

      const stmt = this.db.prepare(`
        INSERT INTO user_preferences (userId, responseMode, debugMode, workingDirectory, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        userId,
        prefs.responseMode,
        prefs.debugMode ? 1 : 0,
        prefs.workingDirectory,
        now,
        now
      );
    }
  }

  /**
   * Get user preference (Phase 6)
   * @param {string} userId
   * @param {string} key - Preference key
   * @returns {any|null}
   */
  getUserPreference(userId, key) {
    const prefs = this.getUserPreferences(userId);
    return prefs ? prefs[key] : null;
  }

  /**
   * Get session metrics (Phase 6)
   * @param {string} userId
   * @param {string} sessionId
   * @returns {Object} Metrics object
   */
  getSessionMetrics(userId, sessionId) {
    // Get command statistics
    const commandStmt = this.db.prepare(`
      SELECT
        COUNT(*) as commandCount,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as commandSuccess,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as commandFailed
      FROM command_history
      WHERE userId = ? AND sessionId = ?
    `);
    const commandStats = commandStmt.get(userId, sessionId);

    // Get top commands
    const topCommandsStmt = this.db.prepare(`
      SELECT command, COUNT(*) as count
      FROM command_history
      WHERE userId = ? AND sessionId = ?
      GROUP BY command
      ORDER BY count DESC
      LIMIT 5
    `);
    const topCommands = topCommandsStmt.all(userId, sessionId);

    // Get tool statistics
    const toolStmt = this.db.prepare(`
      SELECT
        COUNT(*) as toolCount,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as toolSuccess,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as toolFailed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as toolCancelled,
        AVG(duration) as avgToolDuration
      FROM tool_audit
      WHERE userId = ? AND sessionId = ?
    `);
    const toolStats = toolStmt.get(userId, sessionId);

    // Get top tools
    const topToolsStmt = this.db.prepare(`
      SELECT toolName, COUNT(*) as count
      FROM tool_audit
      WHERE userId = ? AND sessionId = ?
      GROUP BY toolName
      ORDER BY count DESC
      LIMIT 5
    `);
    const topTools = topToolsStmt.all(userId, sessionId);

    // Get error statistics
    const errorStmt = this.db.prepare(`
      SELECT COUNT(*) as errorCount
      FROM error_history
      WHERE userId = ? AND sessionId = ?
    `);
    const errorStats = errorStmt.get(userId, sessionId);

    // Get errors by type
    const errorTypeStmt = this.db.prepare(`
      SELECT errorType, COUNT(*) as count
      FROM error_history
      WHERE userId = ? AND sessionId = ?
      GROUP BY errorType
      ORDER BY count DESC
    `);
    const errorsByType = errorTypeStmt.all(userId, sessionId);

    return {
      ...commandStats,
      topCommands,
      ...toolStats,
      topTools,
      ...errorStats,
      errorsByType
    };
  }

  /**
   * Save session context (Phase 7)
   * @param {string} userId
   * @param {string} sessionId
   * @param {string} contextType - 'file', 'ignore', 'workdir'
   * @param {string} contextValue
   * @param {string|null} metadata - JSON string
   */
  saveSessionContext(userId, sessionId, contextType, contextValue, metadata) {
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO session_context (userId, sessionId, contextType, contextValue, metadata, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(userId, sessionId, contextType, contextValue, metadata, now);
  }

  /**
   * Get session context (Phase 7)
   * @param {string} userId
   * @param {string} sessionId
   * @param {string|null} contextType - Optional filter by type
   * @returns {Array<Object>}
   */
  getSessionContext(userId, sessionId, contextType = null) {
    let stmt;

    if (contextType) {
      stmt = this.db.prepare(`
        SELECT * FROM session_context
        WHERE userId = ? AND sessionId = ? AND contextType = ?
        ORDER BY createdAt DESC
      `);
      return stmt.all(userId, sessionId, contextType);
    } else {
      stmt = this.db.prepare(`
        SELECT * FROM session_context
        WHERE userId = ? AND sessionId = ?
        ORDER BY contextType, createdAt DESC
      `);
      return stmt.all(userId, sessionId);
    }
  }

  /**
   * Remove specific session context (Phase 7)
   * @param {string} userId
   * @param {string} sessionId
   * @param {string} contextType
   * @param {string} contextValue
   */
  removeSessionContext(userId, sessionId, contextType, contextValue) {
    const stmt = this.db.prepare(`
      DELETE FROM session_context
      WHERE userId = ? AND sessionId = ? AND contextType = ? AND contextValue = ?
    `);

    stmt.run(userId, sessionId, contextType, contextValue);
  }

  /**
   * Clear session context (Phase 7)
   * @param {string} userId
   * @param {string} sessionId
   * @param {string|null} contextType - Optional filter by type (null = clear all)
   */
  clearSessionContext(userId, sessionId, contextType = null) {
    let stmt;

    if (contextType) {
      stmt = this.db.prepare(`
        DELETE FROM session_context
        WHERE userId = ? AND sessionId = ? AND contextType = ?
      `);
      stmt.run(userId, sessionId, contextType);
    } else {
      stmt = this.db.prepare(`
        DELETE FROM session_context
        WHERE userId = ? AND sessionId = ?
      `);
      stmt.run(userId, sessionId);
    }
  }

  /**
   * Get user role (Phase 9)
   * @param {string} userId
   * @returns {string} Role: 'user', 'admin', 'superadmin'
   */
  getUserRole(userId) {
    const stmt = this.db.prepare(`
      SELECT role FROM admin_users WHERE userId = ?
    `);
    const result = stmt.get(userId);
    return result ? result.role : 'user';
  }

  /**
   * Set user role (Phase 9)
   * @param {string} userId
   * @param {string} role - 'user', 'admin', 'superadmin'
   * @param {string} grantedBy - Admin who granted the role
   */
  setUserRole(userId, role, grantedBy) {
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO admin_users (userId, role, addedBy, addedAt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(userId) DO UPDATE SET
        role = excluded.role,
        addedBy = excluded.addedBy,
        addedAt = excluded.addedAt
    `);

    stmt.run(userId, role, grantedBy, now);
  }

  /**
   * Check if user is admin (Phase 9)
   * @param {string} userId
   * @returns {boolean}
   */
  isAdmin(userId) {
    const role = this.getUserRole(userId);
    return role === 'admin' || role === 'superadmin';
  }

  /**
   * Check if user is superadmin (Phase 9)
   * @param {string} userId
   * @returns {boolean}
   */
  isSuperAdmin(userId) {
    return this.getUserRole(userId) === 'superadmin';
  }

  /**
   * Add phone number to whitelist (Phase 9)
   * @param {string} phoneNumber
   * @param {string} addedBy
   * @param {string} [notes='']
   */
  addToWhitelist(phoneNumber, addedBy, notes = '') {
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO whitelist (phoneNumber, addedBy, addedAt, notes)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(phoneNumber) DO UPDATE SET
        addedBy = excluded.addedBy,
        addedAt = excluded.addedAt,
        notes = excluded.notes
    `);

    stmt.run(phoneNumber, addedBy, now, notes);
  }

  /**
   * Remove phone number from whitelist (Phase 9)
   * @param {string} phoneNumber
   * @returns {boolean} True if removed
   */
  removeFromWhitelist(phoneNumber) {
    const stmt = this.db.prepare(`
      DELETE FROM whitelist WHERE phoneNumber = ?
    `);

    const result = stmt.run(phoneNumber);
    return result.changes > 0;
  }

  /**
   * Get all whitelisted numbers (Phase 9)
   * @returns {Array<Object>} Array of { phoneNumber, addedBy, addedAt, notes }
   */
  getWhitelist() {
    const stmt = this.db.prepare(`
      SELECT * FROM whitelist ORDER BY addedAt DESC
    `);

    return stmt.all();
  }

  /**
   * Check if phone number is whitelisted (Phase 9)
   * Checks database first, then falls back to .env if configured
   * @param {string} phoneNumber
   * @returns {boolean}
   */
  isWhitelisted(phoneNumber) {
    // Check database first
    const stmt = this.db.prepare(`
      SELECT 1 FROM whitelist WHERE phoneNumber = ?
    `);
    const result = stmt.get(phoneNumber);

    if (result) return true;

    // Fallback to .env if mode allows
    const mode = process.env.WHITELIST_MODE || 'database';
    if (mode === 'env' || mode === 'both') {
      const envWhitelist = process.env.ALLOWED_USERS?.split(',') || [];
      return envWhitelist.includes(phoneNumber);
    }

    return false;
  }

  /**
   * Log admin action (Phase 9)
   * @param {string} userId
   * @param {string} action
   * @param {string|null} target
   * @param {string|null} details
   * @returns {number} Inserted row ID
   */
  logAudit(userId, action, target, details) {
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO audit_log (userId, action, target, details, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(userId, action, target || null, details || null, now);
    return result.lastInsertRowid;
  }

  /**
   * Get audit log (Phase 9)
   * @param {number} [limit=50] - Maximum number of results
   * @param {number} [offset=0] - Number of results to skip
   * @param {object} [filters={}] - Optional filters { userId, action, startTime, endTime }
   * @returns {Array<Object>}
   */
  getAuditLog(limit = 50, offset = 0, filters = {}) {
    let query = `SELECT * FROM audit_log WHERE 1=1`;
    const params = [];

    if (filters.userId) {
      query += ` AND userId = ?`;
      params.push(filters.userId);
    }

    if (filters.action) {
      query += ` AND action = ?`;
      params.push(filters.action);
    }

    if (filters.startTime) {
      query += ` AND timestamp >= ?`;
      params.push(filters.startTime);
    }

    if (filters.endTime) {
      query += ` AND timestamp <= ?`;
      params.push(filters.endTime);
    }

    query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Get system-wide statistics (Phase 9)
   * @returns {Object} Statistics object
   */
  getSystemStats() {
    const stats = {};
    const now = Date.now();
    const day24hAgo = now - (24 * 60 * 60 * 1000);

    // User stats
    stats.totalUsers = this.db.prepare(`
      SELECT COUNT(DISTINCT userId) as count FROM command_history
    `).get().count;

    stats.adminCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM admin_users WHERE role = 'admin'
    `).get().count;

    stats.superadminCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM admin_users WHERE role = 'superadmin'
    `).get().count;

    // Command stats
    stats.totalCommands = this.db.prepare(`
      SELECT COUNT(*) as count FROM command_history
    `).get().count;

    stats.commandsLast24h = this.db.prepare(`
      SELECT COUNT(*) as count FROM command_history WHERE executedAt > ?
    `).get(day24hAgo).count;

    const commandSuccessData = this.db.prepare(`
      SELECT
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successCount,
        COUNT(*) as totalCount
      FROM command_history
    `).get();

    stats.commandSuccessRate = commandSuccessData.totalCount > 0
      ? Math.round((commandSuccessData.successCount / commandSuccessData.totalCount) * 100)
      : 0;

    // Tool stats
    stats.totalTools = this.db.prepare(`
      SELECT COUNT(*) as count FROM tool_audit
    `).get().count;

    stats.toolsLast24h = this.db.prepare(`
      SELECT COUNT(*) as count FROM tool_audit WHERE executedAt > ?
    `).get(day24hAgo).count;

    const toolSuccessData = this.db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successCount,
        COUNT(*) as totalCount
      FROM tool_audit
    `).get();

    stats.toolSuccessRate = toolSuccessData.totalCount > 0
      ? Math.round((toolSuccessData.successCount / toolSuccessData.totalCount) * 100)
      : 0;

    // Error stats
    stats.totalErrors = this.db.prepare(`
      SELECT COUNT(*) as count FROM error_history
    `).get().count;

    stats.errorsLast24h = this.db.prepare(`
      SELECT COUNT(*) as count FROM error_history WHERE occurredAt > ?
    `).get(day24hAgo).count;

    // Database stats
    stats.savedSessions = this.db.prepare(`
      SELECT COUNT(*) as count FROM saved_sessions
    `).get().count;

    stats.auditLogs = this.db.prepare(`
      SELECT COUNT(*) as count FROM audit_log
    `).get().count;

    // activeSessions will be set by caller from SessionManager
    stats.activeSessions = 0;

    return stats;
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }

  /**
   * Get database instance (for advanced queries)
   * @returns {Database}
   */
  getDb() {
    return this.db;
  }
}

export default SessionDatabase;
