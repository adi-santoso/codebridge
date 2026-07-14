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
