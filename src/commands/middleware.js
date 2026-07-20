/**
 * Command Middleware
 *
 * Middleware chain for command execution:
 * - Authentication check (whitelist)
 * - Rate limiting (per user)
 * - Command logging
 * - Response formatting
 *
 * Middleware format:
 * (context, next) => Promise<void>
 *
 * Context shape:
 * {
 *   userId, command, args, rawArgs,
 *   sessionManager, logger,
 *   response: { success, message, data, error, timestamp }
 * }
 */

import { Logger } from '../utils/logger.js';

/**
 * Simple LRU Cache implementation for rate limiting
 * Auto-evicts least recently used entries when max size exceeded
 */
class LRUCache {
  /**
   * @param {number} maxSize - Maximum number of entries to store
   */
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  /**
   * Get value by key, marks as recently used
   * @param {string} key
   * @returns {*}
   */
  get(key) {
    if (!this.cache.has(key)) {
      return undefined;
    }

    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  /**
   * Set value by key, evicts LRU if needed
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    // Remove if exists (will re-add at end)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict least recently used if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, value);
  }

  /**
   * Check if key exists
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Delete entry by key
   * @param {string} key
   * @returns {boolean}
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * Get current size
   * @returns {number}
   */
  get size() {
    return this.cache.size;
  }

  /**
   * Get all entries iterator
   * @returns {IterableIterator}
   */
  entries() {
    return this.cache.entries();
  }
}

/**
 * Rate limiter storage using LRU cache
 * Automatically evicts least recently used users when max size (1000) exceeded
 * userId -> { commandCounts: Map<command, { count, resetAt }> }
 */
const rateLimitStore = new LRUCache(1000);

/**
 * Authentication middleware - check if user is in whitelist
 */
export async function authMiddleware(context, next) {
  const { userId, allowedNumbers, logger } = context;

  // If no whitelist configured, allow all
  if (!allowedNumbers) {
    return next();
  }

  // Check whitelist
  if (!allowedNumbers.has(userId)) {
    logger.warn(`Unauthorized command attempt from ${userId}`);
    context.response = {
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
      message: null, // Silent drop
      timestamp: Date.now()
    };
    return; // Don't call next() - stop chain
  }

  return next();
}

/**
 * Rate limiting middleware
 */
export async function rateLimitMiddleware(context, next) {
  const { userId, commandConfig, logger } = context;

  const { rateLimit } = commandConfig;
  const { calls, window } = rateLimit;

  // Get or create user rate limit store
  if (!rateLimitStore.has(userId)) {
    rateLimitStore.set(userId, {
      commandCounts: new Map()
    });
  }

  const userStore = rateLimitStore.get(userId);
  const now = Date.now();

  // Get or create command counter
  if (!userStore.commandCounts.has(commandConfig.name)) {
    userStore.commandCounts.set(commandConfig.name, {
      count: 0,
      resetAt: now + window
    });
  }

  const counter = userStore.commandCounts.get(commandConfig.name);

  // Reset counter if window expired
  if (now >= counter.resetAt) {
    counter.count = 0;
    counter.resetAt = now + window;
  }

  // Check rate limit
  if (counter.count >= calls) {
    const waitTime = Math.ceil((counter.resetAt - now) / 1000);
    logger.warn(`Rate limit exceeded for ${userId} on command ${commandConfig.name}`);

    context.response = {
      success: false,
      error: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      message: `⏱️ *Rate Limit Exceeded*\n\n` +
               `You've used this command too many times.\n` +
               `Please wait ${waitTime} seconds before trying again.\n\n` +
               `Limit: ${calls} calls per ${Math.floor(window / 1000)} seconds`,
      timestamp: Date.now()
    };
    return; // Stop chain
  }

  // Increment counter
  counter.count++;

  // Continue to next middleware
  return next();
}

/**
 * Validation middleware
 */
export async function validationMiddleware(context, next) {
  const { command, args, commandConfig, logger } = context;

  // Validate using command's validator
  if (commandConfig.validate && typeof commandConfig.validate === 'function') {
    const validation = commandConfig.validate(args);

    if (!validation.valid) {
      logger.warn(`Validation failed for command ${command}: ${validation.error}`);

      context.response = {
        success: false,
        error: validation.error,
        code: 'VALIDATION_ERROR',
        message: `❌ ${validation.error}`,
        timestamp: Date.now()
      };
      return; // Stop chain
    }
  }

  return next();
}

/**
 * Session check middleware
 */
export async function sessionCheckMiddleware(context, next) {
  const { userId, commandConfig, sessionManager, logger } = context;

  // Check if command requires active session
  if (commandConfig.requiresSession) {
    const session = sessionManager.getActiveSession(userId);

    if (!session) {
      logger.warn(`Session required for command ${commandConfig.name} but user ${userId} has no session`);

      context.response = {
        success: false,
        error: 'Session required',
        code: 'SESSION_REQUIRED',
        message: `❌ *Session Required*\n\n` +
                 `This command requires an active session.\n\n` +
                 `Type /newsession to create one.`,
        timestamp: Date.now()
      };
      return; // Stop chain
    }
  }

  return next();
}

/**
 * Role check middleware (Phase 9)
 * Check if user has required role for command
 */
export async function roleCheckMiddleware(context, next) {
  const { userId, commandConfig, db, logger } = context;

  // Get required role from command config
  const requiredRole = commandConfig.requiredRole || 'user';

  // If only user role required, everyone passes
  if (requiredRole === 'user') {
    return next();
  }

  // Get user's role from database
  const userRole = db.getUserRole(userId);

  // Role hierarchy
  const roleHierarchy = {
    user: 0,
    admin: 1,
    superadmin: 2
  };

  const userLevel = roleHierarchy[userRole] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;

  // Check if user has sufficient role
  if (userLevel < requiredLevel) {
    logger.warn(`Role check failed for ${userId}: has ${userRole}, needs ${requiredRole}`);

    context.response = {
      success: false,
      error: 'Insufficient privileges',
      code: 'ROLE_REQUIRED',
      message: `❌ *Insufficient Privileges*\n\n` +
               `This command requires ${requiredRole} role.\n` +
               `Your role: ${userRole}`,
      timestamp: Date.now()
    };
    return; // Stop chain
  }

  return next();
}

/**
 * Logging middleware - log command execution
 */
export async function loggingMiddleware(context, next) {
  const { userId, command, args, logger, db } = context;
  const startTime = Date.now();

  logger.info(`Command executed: ${command}`, {
    userId,
    args: args.join(' ')
  });

  try {
    // Execute next middleware/handler
    await next();

    const duration = Date.now() - startTime;

    // Log success
    logger.success(`Command completed: ${command} (${duration}ms)`);

    // Save to database (if available)
    if (db && context.response.success !== false) {
      try {
        db.insertCommandHistory({
          userId,
          sessionId: context.sessionId || null,
          command,
          args: JSON.stringify(args),
          result: context.response.message ? context.response.message.substring(0, 500) : null,
          success: context.response.success !== false,
          executedAt: Date.now()
        });
      } catch (dbError) {
        logger.warn(`Failed to save command history: ${dbError.message}`);
      }
    }

  } catch (error) {
    const duration = Date.now() - startTime;

    // Log error
    logger.error(`Command failed: ${command} (${duration}ms)`, {
      error: error.message,
      stack: error.stack
    });

    // Save error to database (if available)
    if (db) {
      try {
        db.insertCommandHistory({
          userId,
          sessionId: context.sessionId || null,
          command,
          args: JSON.stringify(args),
          result: error.message,
          success: false,
          executedAt: Date.now()
        });
      } catch (dbError) {
        logger.warn(`Failed to save command error: ${dbError.message}`);
      }
    }

    // Set error response if not already set
    if (!context.response) {
      context.response = {
        success: false,
        error: error.message,
        code: 'EXECUTION_ERROR',
        message: `❌ Command error: ${error.message}`,
        timestamp: Date.now()
      };
    }
  }
}

/**
 * Response formatting middleware
 */
export async function responseFormattingMiddleware(context, next) {
  await next();

  // Ensure response has timestamp
  if (context.response && !context.response.timestamp) {
    context.response.timestamp = Date.now();
  }

  // Ensure response has success field
  if (context.response && context.response.success === undefined) {
    context.response.success = !context.response.error;
  }

  // Add command name to response
  if (context.response) {
    context.response.command = context.command;
  }
}

/**
 * Cleanup rate limit store periodically
 */
export function cleanupRateLimitStore() {
  const now = Date.now();
  let cleaned = 0;

  for (const [userId, userStore] of rateLimitStore.entries()) {
    // Remove expired command counters
    for (const [command, counter] of userStore.commandCounts.entries()) {
      if (now >= counter.resetAt + 60000) { // 1 minute grace period
        userStore.commandCounts.delete(command);
        cleaned++;
      }
    }

    // Remove empty user stores
    if (userStore.commandCounts.size === 0) {
      rateLimitStore.delete(userId);
    }
  }

  if (cleaned > 0) {
    const logger = new Logger('RateLimitCleanup');
    logger.debug(`Cleaned up ${cleaned} expired rate limit entries`);
  }
}

// Cleanup every 5 minutes
setInterval(cleanupRateLimitStore, 5 * 60 * 1000);

/**
 * Default middleware chain
 */
export const defaultMiddlewareChain = [
  authMiddleware,
  sessionCheckMiddleware,
  roleCheckMiddleware,
  rateLimitMiddleware,
  validationMiddleware,
  loggingMiddleware,
  responseFormattingMiddleware
];

export default {
  authMiddleware,
  rateLimitMiddleware,
  validationMiddleware,
  sessionCheckMiddleware,
  roleCheckMiddleware,
  loggingMiddleware,
  responseFormattingMiddleware,
  defaultMiddlewareChain,
  cleanupRateLimitStore
};
