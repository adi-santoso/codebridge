/**
 * Simple Logger Utility
 *
 * Provides formatted logging for debugging
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
  }

  _log(level, ...args) {
    const timestamp = new Date().toISOString();
    const prefixStr = this.prefix ? `[${this.prefix}]` : '';
    console.log(`${LOG_LEVELS[level]} ${timestamp} ${prefixStr}`, ...args);
  }

  error(...args) {
    this._log('ERROR', ...args);
  }

  warn(...args) {
    this._log('WARN', ...args);
  }

  info(...args) {
    this._log('INFO', ...args);
  }

  success(...args) {
    this._log('SUCCESS', ...args);
  }

  debug(...args) {
    if (process.env.DEBUG === 'true') {
      this._log('DEBUG', ...args);
    }
  }

  // JSON logging for structured data
  json(label, data) {
    console.log(`\n📋 ${label}:`);
    console.log(JSON.stringify(data, null, 2));
  }
}

export default Logger;
