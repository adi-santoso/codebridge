/**
 * Simple Logger Utility
 *
 * Provides formatted logging for debugging with per-user debug mode support
 */

const LOG_LEVELS = {
  ERROR: '❌',
  WARN: '⚠️ ',
  INFO: 'ℹ️ ',
  SUCCESS: '✅',
  DEBUG: '🔍',
};

export class Logger {
  constructor(prefix = '') {
    this.prefix = prefix;

    // Per-user debug sessions (userId -> { enabled, logs[], startedAt })
    this.debugSessions = new Map();

    // Max entries per user (from env or default)
    this.maxDebugEntries = parseInt(process.env.DEBUG_LOG_MAX_ENTRIES || '1000');

    // Log retention in hours
    this.retentionHours = parseInt(process.env.DEBUG_LOG_RETENTION_HOURS || '24');
  }

  _log(level, ...args) {
    const timestamp = new Date().toISOString();
    const prefixStr = this.prefix ? `[${this.prefix}]` : '';
    console.log(`${LOG_LEVELS[level]} ${timestamp} ${prefixStr}`, ...args);
  }

  error(...args) {
    this._log('ERROR', ...args);
    this._logToDebugSessions('error', args);
  }

  warn(...args) {
    this._log('WARN', ...args);
    this._logToDebugSessions('warn', args);
  }

  info(...args) {
    this._log('INFO', ...args);
    this._logToDebugSessions('info', args);
  }

  success(...args) {
    this._log('SUCCESS', ...args);
    this._logToDebugSessions('success', args);
  }

  debug(...args) {
    if (process.env.DEBUG === 'true') {
      this._log('DEBUG', ...args);
    }
    this._logToDebugSessions('debug', args);
  }

  // JSON logging for structured data
  json(label, data) {
    console.log(`\n📋 ${label}:`);
    console.log(JSON.stringify(data, null, 2));
  }

  /**
   * Set debug mode for a user (Phase 6)
   * @param {string} userId
   * @param {boolean} enabled
   */
  setDebugMode(userId, enabled) {
    if (enabled) {
      if (!this.debugSessions.has(userId)) {
        this.debugSessions.set(userId, {
          enabled: true,
          logs: [],
          startedAt: Date.now()
        });
        this._log('INFO', `Debug mode enabled for user: ${userId}`);
      }
    } else {
      if (this.debugSessions.has(userId)) {
        this.debugSessions.delete(userId);
        this._log('INFO', `Debug mode disabled for user: ${userId}`);
      }
    }
  }

  /**
   * Check if debug mode is enabled for user (Phase 6)
   * @param {string} userId
   * @returns {boolean}
   */
  isDebugEnabled(userId) {
    return this.debugSessions.has(userId);
  }

  /**
   * Log to user's debug session (Phase 6)
   * @private
   * @param {string} level
   * @param {Array} args
   */
  _logToDebugSessions(level, args) {
    // Try to extract userId from args (if passed as first argument)
    // This is a best-effort approach
    let userId = null;

    if (args.length > 0 && typeof args[0] === 'string') {
      // Check if first arg looks like a userId (e.g., "628xxx")
      const firstArg = args[0];
      if (/^[0-9]{10,15}$/.test(firstArg)) {
        userId = firstArg;
      }
    }

    // If we found a userId and debug is enabled for them
    if (userId && this.debugSessions.has(userId)) {
      const session = this.debugSessions.get(userId);

      // Create log entry
      const logEntry = {
        level,
        message: this._formatLogArgs(args),
        timestamp: Date.now()
      };

      // Add to session logs
      session.logs.push(logEntry);

      // Rotate if needed (keep only last N entries)
      if (session.logs.length > this.maxDebugEntries) {
        session.logs.shift();
      }

      // Check retention time and clean up old logs
      this._cleanupOldLogs(session);
    }
  }

  /**
   * Format log arguments to string (Phase 6)
   * @private
   * @param {Array} args
   * @returns {string}
   */
  _formatLogArgs(args) {
    return args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
  }

  /**
   * Clean up old logs based on retention period (Phase 6)
   * @private
   * @param {Object} session
   */
  _cleanupOldLogs(session) {
    const cutoffTime = Date.now() - (this.retentionHours * 60 * 60 * 1000);
    session.logs = session.logs.filter(log => log.timestamp >= cutoffTime);
  }

  /**
   * Get debug logs for user (Phase 6)
   * @param {string} userId
   * @param {number} [limit=50] - Maximum number of logs to return
   * @returns {Array<Object>} Array of log entries
   */
  getDebugLogs(userId, limit = 50) {
    const session = this.debugSessions.get(userId);
    if (!session) {
      return [];
    }

    // Clean up old logs before returning
    this._cleanupOldLogs(session);

    // Return last N logs
    const logs = session.logs.slice(-limit);
    return logs;
  }

  /**
   * Clear debug logs for user (Phase 6)
   * @param {string} userId
   */
  clearDebugLogs(userId) {
    const session = this.debugSessions.get(userId);
    if (session) {
      session.logs = [];
      this._log('INFO', `Debug logs cleared for user: ${userId}`);
    }
  }

  /**
   * User-specific logging methods (Phase 6)
   * These methods accept userId as first parameter and log to debug session
   */

  /**
   * Log debug message for specific user
   * @param {string} userId
   * @param {string} message
   * @param {...any} args
   */
  userDebug(userId, message, ...args) {
    const session = this.debugSessions.get(userId);
    if (session) {
      const logEntry = {
        level: 'debug',
        message: this._formatLogArgs([message, ...args]),
        timestamp: Date.now()
      };

      session.logs.push(logEntry);

      // Rotate if needed
      if (session.logs.length > this.maxDebugEntries) {
        session.logs.shift();
      }

      // Also log to console if DEBUG is enabled
      if (process.env.DEBUG === 'true') {
        this._log('DEBUG', `[${userId}]`, message, ...args);
      }
    }
  }

  /**
   * Log info message for specific user
   * @param {string} userId
   * @param {string} message
   * @param {...any} args
   */
  userInfo(userId, message, ...args) {
    const session = this.debugSessions.get(userId);
    if (session) {
      const logEntry = {
        level: 'info',
        message: this._formatLogArgs([message, ...args]),
        timestamp: Date.now()
      };

      session.logs.push(logEntry);

      // Rotate if needed
      if (session.logs.length > this.maxDebugEntries) {
        session.logs.shift();
      }
    }

    // Always log info to console
    this._log('INFO', `[${userId}]`, message, ...args);
  }

  /**
   * Log error message for specific user
   * @param {string} userId
   * @param {string} message
   * @param {...any} args
   */
  userError(userId, message, ...args) {
    const session = this.debugSessions.get(userId);
    if (session) {
      const logEntry = {
        level: 'error',
        message: this._formatLogArgs([message, ...args]),
        timestamp: Date.now()
      };

      session.logs.push(logEntry);

      // Rotate if needed
      if (session.logs.length > this.maxDebugEntries) {
        session.logs.shift();
      }
    }

    // Always log errors to console
    this._log('ERROR', `[${userId}]`, message, ...args);
  }
}

export default Logger;
