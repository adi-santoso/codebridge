/**
 * Command Handler
 *
 * Main dispatcher for command execution with middleware chain
 *
 * Flow:
 * 1. Parse command
 * 2. Get command from registry
 * 3. Run middleware chain
 * 4. Execute command handler
 * 5. Format and return response
 */

import { Logger } from '../utils/logger.js';
import { getRegistry } from './registry.js';
import { defaultMiddlewareChain } from './middleware.js';
import { CommandParser } from './parser.js';

// Import command handlers
import * as basicHandlers from './handlers/basic.js';
import { SessionCommands } from './session-commands.js';

export class CommandHandler {
  /**
   * Create CommandHandler instance
   * @param {Object} options
   * @param {SessionManager} options.sessionManager
   * @param {SessionDatabase} options.db
   * @param {string} options.projectRootPath
   * @param {Set|null} options.allowedNumbers - Whitelist
   */
  constructor(options) {
    this.sessionManager = options.sessionManager;
    this.db = options.db;
    this.projectRootPath = options.projectRootPath;
    this.allowedNumbers = options.allowedNumbers;
    this.logger = new Logger('CommandHandler');

    // Get command registry
    this.registry = getRegistry();

    // Session commands instance (for existing commands)
    this.sessionCommands = new SessionCommands({
      sessionManager: this.sessionManager,
      projectRootPath: this.projectRootPath
    });

    // Basic handlers
    this.basicHandlers = basicHandlers;

    // Middleware chain
    this.middlewareChain = [...defaultMiddlewareChain];

    this.logger.info('CommandHandler initialized');
  }

  /**
   * Execute command
   * @param {string} userId
   * @param {string} message
   * @returns {Promise<Object>} Response object
   */
  async execute(userId, message) {
    // Parse command
    const parsed = CommandParser.parse(message);

    if (!parsed) {
      return {
        success: false,
        error: 'Invalid command format',
        message: '❌ Invalid command format. Commands must start with /',
        timestamp: Date.now()
      };
    }

    const { command, args, rawArgs } = parsed;

    // Get command from registry
    const commandConfig = this.registry.get(command);

    if (!commandConfig) {
      return {
        success: false,
        error: 'Unknown command',
        message: `❌ Unknown command: /${command}\n\nType /help to see available commands.`,
        timestamp: Date.now()
      };
    }

    // Get active session (if exists)
    const session = this.sessionManager.getActiveSession(userId);

    // Build context
    const context = {
      userId,
      command,
      args,
      rawArgs,
      commandConfig,
      sessionManager: this.sessionManager,
      sessionCommands: this.sessionCommands,
      basicHandlers: this.basicHandlers,
      db: this.db,
      allowedNumbers: this.allowedNumbers,
      logger: this.logger,
      session,
      sessionId: session ? session.sessionId : null,
      response: null,
      registry: this.registry,
      projectRootPath: this.projectRootPath
    };

    // Execute middleware chain
    await this.executeMiddlewareChain(context);

    // Return response
    return context.response || {
      success: false,
      error: 'No response generated',
      message: '❌ Command executed but no response was generated',
      timestamp: Date.now()
    };
  }

  /**
   * Execute middleware chain
   * @private
   */
  async executeMiddlewareChain(context) {
    let index = 0;

    const next = async () => {
      // If response is already set by middleware, stop chain
      if (context.response && context.response.success === false) {
        return;
      }

      if (index < this.middlewareChain.length) {
        const middleware = this.middlewareChain[index++];
        await middleware(context, next);
      } else {
        // All middleware passed, execute handler
        await this.executeHandler(context);
      }
    };

    await next();
  }

  /**
   * Execute command handler
   * @private
   */
  async executeHandler(context) {
    const { commandConfig, args, rawArgs } = context;
    const handlerPath = commandConfig.handler;

    try {
      let result;

      // Route to appropriate handler based on handler path
      if (handlerPath.startsWith('basic.')) {
        const handlerName = handlerPath.split('.')[1];
        result = await this.basicHandlers[handlerName](context);
      } else if (handlerPath.startsWith('session.')) {
        // Use existing SessionCommands for backward compatibility
        const commandName = handlerPath.split('.')[1];
        result = await this.executeSessionCommand(context, commandName);
      } else {
        throw new Error(`Unknown handler path: ${handlerPath}`);
      }

      // Set response
      if (typeof result === 'string') {
        // Handler returned a string message
        context.response = {
          success: true,
          message: result,
          timestamp: Date.now()
        };
      } else if (typeof result === 'object') {
        // Handler returned a response object
        context.response = {
          success: result.success !== false,
          message: result.message,
          data: result.data,
          error: result.error,
          timestamp: Date.now()
        };
      } else {
        throw new Error('Handler returned invalid response type');
      }

    } catch (error) {
      this.logger.error(`Handler execution failed for ${commandConfig.name}:`, error.message);

      context.response = {
        success: false,
        error: error.message,
        code: 'HANDLER_ERROR',
        message: `❌ Command error: ${error.message}`,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Execute session command (backward compatibility)
   * @private
   */
  async executeSessionCommand(context, commandName) {
    const { userId, args, rawArgs } = context;

    // Map new command names to SessionCommands methods
    const methodMap = {
      newsession: 'handleNewSession',
      sessions: 'handleListSessions',
      session: 'handleSwitchSession',
      closesession: 'handleCloseSession',
      projects: 'handleListProjects',
      project: 'handleSelectProject',
      clear: 'handleClearHistory'
    };

    const methodName = methodMap[commandName];

    if (!methodName) {
      throw new Error(`Unknown session command: ${commandName}`);
    }

    // Call SessionCommands method
    const method = this.sessionCommands[methodName].bind(this.sessionCommands);

    // Different commands have different signatures
    switch (commandName) {
      case 'session':
        return method(userId, args[0]);
      case 'project':
        return method(userId, rawArgs);
      default:
        return method(userId);
    }
  }

  /**
   * Add middleware to chain
   * @param {Function} middleware
   * @param {number} position - Insert position (default: before last)
   */
  addMiddleware(middleware, position = -1) {
    if (position === -1) {
      // Insert before last (response formatting)
      this.middlewareChain.splice(this.middlewareChain.length - 1, 0, middleware);
    } else {
      this.middlewareChain.splice(position, 0, middleware);
    }
  }

  /**
   * Remove middleware from chain
   * @param {Function} middleware
   */
  removeMiddleware(middleware) {
    const index = this.middlewareChain.indexOf(middleware);
    if (index !== -1) {
      this.middlewareChain.splice(index, 1);
    }
  }

  /**
   * Get command registry
   * @returns {CommandRegistry}
   */
  getRegistry() {
    return this.registry;
  }
}

export default CommandHandler;
