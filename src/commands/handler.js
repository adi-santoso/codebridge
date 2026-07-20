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
import * as sessionHandlers from './handlers/session.js';
import * as toolHandlers from './handlers/tool.js';
import * as fileHandlers from './handlers/file.js';
import * as debugHandlers from './handlers/debug.js';
import * as responseHandlers from './handlers/response.js';
import * as contextHandlers from './handlers/context.js';
import * as templateHandlers from './handlers/template.js';
import * as adminHandlers from './handlers/admin.js';
import { SessionCommands } from './session-commands.js';

export class CommandHandler {
  /**
   * Create CommandHandler instance
   * @param {Object} options
   * @param {SessionManager} options.sessionManager
   * @param {SessionDatabase} options.db
   * @param {string} options.projectRootPath
   * @param {Set|null} options.allowedNumbers - Whitelist
   * @param {Object} options.projectRegistry - Project registry
   */
  constructor(options) {
    this.sessionManager = options.sessionManager;
    this.db = options.db;
    this.projectRootPath = options.projectRootPath;
    this.projectRegistry = options.projectRegistry;
    this.allowedNumbers = options.allowedNumbers;
    this.logger = new Logger('CommandHandler');

    // Get command registry
    this.registry = getRegistry();

    // Session commands instance (for existing commands - backward compatibility)
    this.sessionCommands = new SessionCommands({
      sessionManager: this.sessionManager,
      projectRootPath: this.projectRootPath
    });

    // Handler modules
    this.basicHandlers = basicHandlers;
    this.sessionHandlers = sessionHandlers;
    this.toolHandlers = toolHandlers;
    this.fileHandlers = fileHandlers;
    this.debugHandlers = debugHandlers;
    this.responseHandlers = responseHandlers;
    this.contextHandlers = contextHandlers;
    this.templateHandlers = templateHandlers;
    this.adminHandlers = adminHandlers;

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
      flags: parsed.flags || {},
      commandConfig,
      sessionManager: this.sessionManager,
      sessionCommands: this.sessionCommands,
      basicHandlers: this.basicHandlers,
      sessionHandlers: this.sessionHandlers,
      toolHandlers: this.toolHandlers,
      fileHandlers: this.fileHandlers,
      debugHandlers: this.debugHandlers,
      responseHandlers: this.responseHandlers,
      contextHandlers: this.contextHandlers,
      templateHandlers: this.templateHandlers,
      adminHandlers: this.adminHandlers,
      db: this.db,
      allowedNumbers: this.allowedNumbers,
      logger: this.logger,
      session,
      sessionId: session ? session.sessionId : null,
      response: null,
      registry: this.registry,
      projectRootPath: this.projectRootPath,
      projectRegistry: this.projectRegistry
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
        // Use new session handlers (Phase 2)
        const handlerName = handlerPath.split('.')[1];
        if (this.sessionHandlers[handlerName]) {
          result = await this.sessionHandlers[handlerName](context);
        } else {
          // Fallback to old SessionCommands for backward compatibility
          result = await this.executeSessionCommand(context, handlerName);
        }
      } else if (handlerPath.startsWith('tool.')) {
        // Tool handlers (Phase 3)
        const handlerName = handlerPath.split('.')[1];
        result = await this.toolHandlers[handlerName](context);
      } else if (handlerPath.startsWith('file.')) {
        // File handlers (Phase 4)
        const handlerName = handlerPath.split('.')[1];
        result = await this.fileHandlers[handlerName](context);
      } else if (handlerPath.startsWith('debug.')) {
        // Debug handlers (Phase 6)
        const handlerName = handlerPath.split('.')[1];

        // Special handling for /debug on|off
        if (handlerName === 'debugCommand') {
          const action = context.args[0].toLowerCase();
          if (action === 'on') {
            result = await this.debugHandlers.debugOn(context);
          } else {
            result = await this.debugHandlers.debugOff(context);
          }
        } else {
          result = await this.debugHandlers[handlerName](context);
        }
      } else if (handlerPath.startsWith('response.')) {
        // Response control handlers (Phase 4)
        const handlerName = handlerPath.split('.')[1];
        result = await this.responseHandlers[handlerName](context);
      } else if (handlerPath.startsWith('context.')) {
        // Context management handlers (Phase 7)
        const handlerName = handlerPath.split('.')[1];

        // Special handling for /context and /ignore sub-commands
        if (handlerName === 'contextAdd') {
          // /context <add|list|clear>
          const subCommand = context.args[0];
          if (!subCommand) {
            result = '❌ Missing sub-command.\n\n*Usage:* /context <add|list|clear> [file]\n*Examples:*\n  /context add src/config.js\n  /context list\n  /context clear';
          } else if (subCommand === 'add') {
            // Remove 'add' from args
            context.args = context.args.slice(1);
            result = await this.contextHandlers.contextAdd(context);
          } else if (subCommand === 'list') {
            result = await this.contextHandlers.contextList(context);
          } else if (subCommand === 'clear') {
            result = await this.contextHandlers.contextClear(context);
          } else {
            result = `❌ Unknown sub-command: ${subCommand}\n\n*Usage:* /context <add|list|clear>`;
          }
        } else if (handlerName === 'ignore') {
          // /ignore <pattern|list|clear>
          const arg = context.args[0];
          if (!arg) {
            result = await this.contextHandlers.ignore(context);
          } else if (arg === 'list') {
            result = await this.contextHandlers.ignoreList(context);
          } else if (arg === 'clear') {
            result = await this.contextHandlers.ignoreClear(context);
          } else {
            // It's a pattern
            result = await this.contextHandlers.ignore(context);
          }
        } else {
          result = await this.contextHandlers[handlerName](context);
        }
      } else if (handlerPath.startsWith('template.')) {
        // Template handlers (Phase 8)
        const handlerName = handlerPath.split('.')[1];
        result = await this.templateHandlers[handlerName](context);
      } else if (handlerPath.startsWith('admin.')) {
        // Admin handlers (Phase 9)
        const handlerName = handlerPath.split('.')[1];
        result = await this.adminHandlers[handlerName](context);
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

      // Log error to database (Phase 6)
      if (this.db && this.db.logError && context.sessionId) {
        try {
          this.db.logError(
            context.userId,
            context.sessionId,
            'COMMAND_ERROR',
            error.message,
            error.stack,
            {
              command: context.command,
              args: context.args
            }
          );
        } catch (dbError) {
          this.logger.error('Failed to log error to database:', dbError.message);
        }
      }

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
