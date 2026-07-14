/**
 * Command Registry
 *
 * Central registry for all commands with metadata, validation, and lookup
 *
 * Features:
 * - Command metadata storage (name, aliases, description, etc.)
 * - Category-based organization
 * - Role and permission checking
 * - Command lookup by name or alias
 * - Validation rules
 */

import { Logger } from '../utils/logger.js';

export class CommandRegistry {
  constructor() {
    this.commands = new Map();
    this.aliases = new Map();
    this.logger = new Logger('CommandRegistry');
    this.initialized = false;
  }

  /**
   * Initialize registry with default commands
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    // Register all commands
    this.registerDefaultCommands();
    this.initialized = true;

    this.logger.info(`Registry initialized with ${this.commands.size} commands`);
  }

  /**
   * Register a command
   * @param {Object} config - Command configuration
   */
  register(config) {
    const {
      name,
      aliases = [],
      category = 'general',
      description = '',
      usage = '',
      examples = [],
      requiresAuth = true,
      requiresSession = false,
      requiredRole = 'user',
      rateLimit = { calls: 20, window: 60000 },
      handler = null,
      validate = null
    } = config;

    // Validate required fields
    if (!name) {
      throw new Error('Command name is required');
    }

    if (!handler) {
      throw new Error(`Handler is required for command: ${name}`);
    }

    // Check for duplicates
    if (this.commands.has(name)) {
      throw new Error(`Command already registered: ${name}`);
    }

    // Check for alias conflicts BEFORE registering
    const conflictingAliases = [];
    for (const alias of aliases) {
      if (this.aliases.has(alias)) {
        const existingCommand = this.aliases.get(alias);
        conflictingAliases.push({ alias, existingCommand });
      }
      // Also check if alias conflicts with existing command name
      if (this.commands.has(alias)) {
        conflictingAliases.push({ alias, existingCommand: alias });
      }
    }

    // If conflicts detected, log error and throw
    if (conflictingAliases.length > 0) {
      const conflicts = conflictingAliases
        .map(c => `  - Alias "${c.alias}" conflicts with command "${c.existingCommand}"`)
        .join('\n');

      const errorMsg = `Alias conflict detected for command "${name}":\n${conflicts}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Register command
    const command = {
      name,
      aliases,
      category,
      description,
      usage,
      examples,
      requiresAuth,
      requiresSession,
      requiredRole,
      rateLimit,
      handler,
      validate,
      registeredAt: Date.now()
    };

    this.commands.set(name, command);

    // Register aliases (safe now after conflict check)
    for (const alias of aliases) {
      this.aliases.set(alias, name);
    }

    this.logger.debug(`Registered command: ${name} (aliases: ${aliases.join(', ')})`);
  }

  /**
   * Get command by name or alias
   * @param {string} nameOrAlias
   * @returns {Object|null}
   */
  get(nameOrAlias) {
    const normalized = nameOrAlias.toLowerCase();

    // Try direct lookup
    if (this.commands.has(normalized)) {
      return this.commands.get(normalized);
    }

    // Try alias lookup
    if (this.aliases.has(normalized)) {
      const commandName = this.aliases.get(normalized);
      return this.commands.get(commandName);
    }

    return null;
  }

  /**
   * Check if command exists
   * @param {string} nameOrAlias
   * @returns {boolean}
   */
  has(nameOrAlias) {
    const normalized = nameOrAlias.toLowerCase();
    return this.commands.has(normalized) || this.aliases.has(normalized);
  }

  /**
   * Get all commands in a category
   * @param {string} category
   * @returns {Array<Object>}
   */
  getByCategory(category) {
    const commands = [];
    for (const [name, command] of this.commands.entries()) {
      if (command.category === category) {
        commands.push(command);
      }
    }
    return commands;
  }

  /**
   * Get all categories
   * @returns {Array<string>}
   */
  getCategories() {
    const categories = new Set();
    for (const command of this.commands.values()) {
      categories.add(command.category);
    }
    return Array.from(categories).sort();
  }

  /**
   * Get all commands
   * @returns {Array<Object>}
   */
  getAll() {
    return Array.from(this.commands.values());
  }

  /**
   * Get command count
   * @returns {number}
   */
  count() {
    return this.commands.size;
  }

  /**
   * Validate command arguments
   * @param {string} commandName
   * @param {Array<string>} args
   * @returns {Object} { valid: boolean, error?: string }
   */
  validate(commandName, args) {
    const command = this.get(commandName);

    if (!command) {
      return {
        valid: false,
        error: `Unknown command: ${commandName}`
      };
    }

    // Use custom validator if provided
    if (command.validate && typeof command.validate === 'function') {
      return command.validate(args);
    }

    // Default validation: success
    return { valid: true };
  }

  /**
   * Register default commands (Phase 1: Basic commands)
   * @private
   */
  registerDefaultCommands() {
    // Help command
    this.register({
      name: 'help',
      aliases: ['h', '?'],
      category: 'general',
      description: 'Show available commands and usage',
      usage: '/help [command]',
      examples: ['/help', '/help status'],
      requiresAuth: true,
      requiresSession: false,
      requiredRole: 'user',
      rateLimit: { calls: 10, window: 60000 },
      handler: 'basic.help'
    });

    // Ping command
    this.register({
      name: 'ping',
      aliases: ['heartbeat'],
      category: 'general',
      description: 'Check if CodeBridge is alive and measure latency',
      usage: '/ping',
      examples: ['/ping'],
      requiresAuth: true,
      requiresSession: false,
      requiredRole: 'user',
      rateLimit: { calls: 30, window: 60000 },
      handler: 'basic.ping'
    });

    // Version command
    this.register({
      name: 'version',
      aliases: ['v', 'ver'],
      category: 'general',
      description: 'Show CodeBridge version and environment info',
      usage: '/version',
      examples: ['/version'],
      requiresAuth: true,
      requiresSession: false,
      requiredRole: 'user',
      rateLimit: { calls: 10, window: 60000 },
      handler: 'basic.version'
    });

    // Status command (enhanced from existing)
    this.register({
      name: 'status',
      aliases: ['info'],
      category: 'session',
      description: 'Show current session status and statistics',
      usage: '/status',
      examples: ['/status'],
      requiresAuth: true,
      requiresSession: false,
      requiredRole: 'user',
      rateLimit: { calls: 20, window: 60000 },
      handler: 'basic.status'
    });

    // Existing session commands (register for new system)
    this.register({
      name: 'newsession',
      aliases: ['new', 'create'],
      category: 'session',
      description: 'Create a new session',
      usage: '/newsession',
      examples: ['/newsession'],
      requiresAuth: true,
      requiresSession: false,
      requiredRole: 'user',
      rateLimit: { calls: 10, window: 60000 },
      handler: 'session.newsession'
    });

    this.register({
      name: 'sessions',
      aliases: ['list', 'ls'],
      category: 'session',
      description: 'List all your sessions',
      usage: '/sessions',
      examples: ['/sessions'],
      requiresAuth: true,
      requiresSession: false,
      requiredRole: 'user',
      rateLimit: { calls: 20, window: 60000 },
      handler: 'session.sessions'
    });

    this.register({
      name: 'session',
      aliases: ['switch'],
      category: 'session',
      description: 'Switch to a specific session',
      usage: '/session <sessionId>',
      examples: ['/session sess_abc123'],
      requiresAuth: true,
      requiresSession: false,
      requiredRole: 'user',
      rateLimit: { calls: 20, window: 60000 },
      handler: 'session.session',
      validate: (args) => {
        if (args.length === 0) {
          return {
            valid: false,
            error: 'Missing session ID. Usage: /session <sessionId>'
          };
        }
        return { valid: true };
      }
    });

    this.register({
      name: 'closesession',
      aliases: ['close', 'end'],
      category: 'session',
      description: 'Close current session',
      usage: '/closesession',
      examples: ['/closesession'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 10, window: 60000 },
      handler: 'session.closesession'
    });

    this.register({
      name: 'projects',
      aliases: ['listprojects'],
      category: 'project',
      description: 'List available projects',
      usage: '/projects',
      examples: ['/projects'],
      requiresAuth: true,
      requiresSession: false,
      requiredRole: 'user',
      rateLimit: { calls: 20, window: 60000 },
      handler: 'session.projects'
    });

    this.register({
      name: 'project',
      aliases: ['selectproject'],
      category: 'project',
      description: 'Select project for current session',
      usage: '/project <name>',
      examples: ['/project codebridge'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 20, window: 60000 },
      handler: 'session.project',
      validate: (args) => {
        if (args.length === 0) {
          return {
            valid: false,
            error: 'Missing project name. Usage: /project <projectName>'
          };
        }
        return { valid: true };
      }
    });

    this.register({
      name: 'clear',
      aliases: ['reset', 'restart'],
      category: 'session',
      description: 'Clear conversation history',
      usage: '/clear',
      examples: ['/clear'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 10, window: 60000 },
      handler: 'session.clear'
    });
  }
}

// Singleton instance
let registryInstance = null;

/**
 * Get command registry singleton
 * @returns {CommandRegistry}
 */
export function getRegistry() {
  if (!registryInstance) {
    registryInstance = new CommandRegistry();
    registryInstance.initialize();
  }
  return registryInstance;
}

export default CommandRegistry;
