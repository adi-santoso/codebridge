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
      aliases: ['listses'],
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

    // Phase 2: Session Management Commands

    this.register({
      name: 'reset',
      aliases: ['clear', 'restart'],
      category: 'session',
      description: 'Clear conversation history and start fresh',
      usage: '/reset',
      examples: ['/reset', '/clear'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 10, window: 60000 },
      handler: 'session.reset'
    });

    this.register({
      name: 'history',
      aliases: ['hist'],
      category: 'session',
      description: 'Show last N commands in conversation',
      usage: '/history [n]',
      examples: ['/history', '/history 20', '/history --limit=30'],
      requiresAuth: true,
      requiresSession: false,
      requiredRole: 'user',
      rateLimit: { calls: 20, window: 60000 },
      handler: 'session.history'
    });

    this.register({
      name: 'save',
      aliases: ['snapshot'],
      category: 'session',
      description: 'Save current session state with a name',
      usage: '/save <name>',
      examples: ['/save mywork', '/save project-v2'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 10, window: 60000 },
      handler: 'session.save',
      validate: (args) => {
        if (args.length === 0) {
          return {
            valid: false,
            error: 'Missing session name. Usage: /save <name>'
          };
        }
        return { valid: true };
      }
    });

    this.register({
      name: 'load',
      aliases: ['restore'],
      category: 'session',
      description: 'Restore a previously saved session',
      usage: '/load [name]',
      examples: ['/load', '/load mywork'],
      requiresAuth: true,
      requiresSession: false,
      requiredRole: 'user',
      rateLimit: { calls: 10, window: 60000 },
      handler: 'session.load'
    });

    this.register({
      name: 'delete',
      aliases: ['remove', 'rm'],
      category: 'session',
      description: 'Delete a saved session',
      usage: '/delete <name>',
      examples: ['/delete mywork'],
      requiresAuth: true,
      requiresSession: false,
      requiredRole: 'user',
      rateLimit: { calls: 10, window: 60000 },
      handler: 'session.deleteSession',
      validate: (args) => {
        if (args.length === 0) {
          return {
            valid: false,
            error: 'Missing session name. Usage: /delete <name>'
          };
        }
        return { valid: true };
      }
    });

    // Phase 3: Tool Control Commands

    this.register({
      name: 'cancel',
      aliases: ['stop', 'abort'],
      category: 'tool',
      description: 'Stop current tool execution',
      usage: '/cancel',
      examples: ['/cancel', '/stop'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 10, window: 60000 },
      handler: 'tool.cancel'
    });

    this.register({
      name: 'retry',
      aliases: ['redo'],
      category: 'tool',
      description: 'Retry last failed tool execution',
      usage: '/retry [--force]',
      examples: ['/retry', '/retry --force'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 10, window: 60000 },
      handler: 'tool.retry'
    });

    this.register({
      name: 'tools',
      aliases: ['listtools'],
      category: 'tool',
      description: 'List available tools with status',
      usage: '/tools [category]',
      examples: ['/tools', '/tools file', '/tools search'],
      requiresAuth: true,
      requiresSession: false,
      requiredRole: 'user',
      rateLimit: { calls: 20, window: 60000 },
      handler: 'tool.tools'
    });

    this.register({
      name: 'allow',
      aliases: ['enable'],
      category: 'tool',
      description: 'Enable specific tool',
      usage: '/allow <tool>',
      examples: ['/allow Bash', '/allow Read', '/allow *'],
      requiresAuth: true,
      requiresSession: false,
      requiredRole: 'user',
      rateLimit: { calls: 10, window: 60000 },
      handler: 'tool.allow',
      validate: (args) => {
        if (args.length === 0) {
          return {
            valid: false,
            error: 'Missing tool name. Usage: /allow <tool>'
          };
        }
        return { valid: true };
      }
    });

    this.register({
      name: 'deny',
      aliases: ['disable'],
      category: 'tool',
      description: 'Disable specific tool',
      usage: '/deny <tool>',
      examples: ['/deny Bash', '/deny Web*'],
      requiresAuth: true,
      requiresSession: false,
      requiredRole: 'user',
      rateLimit: { calls: 10, window: 60000 },
      handler: 'tool.deny',
      validate: (args) => {
        if (args.length === 0) {
          return {
            valid: false,
            error: 'Missing tool name. Usage: /deny <tool>'
          };
        }
        return { valid: true };
      }
    });

    this.register({
      name: 'toollog',
      aliases: ['toolhistory'],
      category: 'tool',
      description: 'Show tool execution history',
      usage: '/toollog [n]',
      examples: ['/toollog', '/toollog 20', '/toollog --tool=Bash', '/toollog --status=error'],
      requiresAuth: true,
      requiresSession: false,
      requiredRole: 'user',
      rateLimit: { calls: 20, window: 60000 },
      handler: 'tool.toollog'
    });

    // Phase 4: File Operations Commands

    this.register({
      name: 'ls',
      aliases: ['dir', 'list'],
      category: 'file',
      description: 'List directory contents',
      usage: '/ls [path]',
      examples: ['/ls', '/ls src/', '/ls src/commands'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 30, window: 60000 },
      handler: 'file.ls'
    });

    this.register({
      name: 'cat',
      aliases: ['read', 'view'],
      category: 'file',
      description: 'Read file content',
      usage: '/cat <file>',
      examples: ['/cat package.json', '/cat src/index.js', '/cat README.md'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 20, window: 60000 },
      handler: 'file.cat',
      validate: (args) => {
        if (args.length === 0) {
          return {
            valid: false,
            error: 'Missing file path. Usage: /cat <file>'
          };
        }
        return { valid: true };
      }
    });

    this.register({
      name: 'tree',
      aliases: ['dirtree'],
      category: 'file',
      description: 'Show directory tree structure',
      usage: '/tree [path] [--depth=N]',
      examples: ['/tree', '/tree src/', '/tree --depth=3'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 15, window: 60000 },
      handler: 'file.tree'
    });

    this.register({
      name: 'search',
      aliases: ['grep', 'find'],
      category: 'file',
      description: 'Search for pattern in files',
      usage: '/search <pattern> [path] [--file=*.ext] [--i] [--limit=N]',
      examples: [
        '/search "function"',
        '/search "import" src/',
        '/search --file="*.js" "TODO"',
        '/search --limit=100 "error"'
      ],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 15, window: 60000 },
      handler: 'file.search',
      validate: (args) => {
        if (args.length === 0) {
          return {
            valid: false,
            error: 'Missing search pattern. Usage: /search <pattern> [path]'
          };
        }
        return { valid: true };
      }
    });

    this.register({
      name: 'diff',
      aliases: ['gitdiff', 'changes'],
      category: 'file',
      description: 'Show git diff for file or directory',
      usage: '/diff [path]',
      examples: ['/diff', '/diff src/index.js', '/diff src/'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 20, window: 60000 },
      handler: 'file.diff'
    });

    // Phase 6: Debug & Info Commands

    this.register({
      name: 'debug',
      aliases: [],
      category: 'debug',
      description: 'Enable or disable debug mode',
      usage: '/debug <on|off>',
      examples: ['/debug on', '/debug off'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 10, window: 60000 },
      handler: 'debug.debugCommand',
      validate: (args) => {
        if (args.length === 0) {
          return {
            valid: false,
            error: 'Missing argument. Usage: /debug <on|off>'
          };
        }
        const action = args[0].toLowerCase();
        if (action !== 'on' && action !== 'off') {
          return {
            valid: false,
            error: 'Invalid argument. Use: /debug on or /debug off'
          };
        }
        return { valid: true };
      }
    });

    this.register({
      name: 'errors',
      aliases: ['errorlog'],
      category: 'debug',
      description: 'Show recent error history',
      usage: '/errors [n]',
      examples: ['/errors', '/errors 20', '/errors 50'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 20, window: 60000 },
      handler: 'debug.errors'
    });

    this.register({
      name: 'logs',
      aliases: ['debuglogs'],
      category: 'debug',
      description: 'Show debug logs (requires debug mode)',
      usage: '/logs [n]',
      examples: ['/logs', '/logs 100', '/logs 200'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 20, window: 60000 },
      handler: 'debug.logs'
    });

    this.register({
      name: 'metrics',
      aliases: ['stats', 'statistics'],
      category: 'debug',
      description: 'Show session performance metrics',
      usage: '/metrics',
      examples: ['/metrics'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 20, window: 60000 },
      handler: 'debug.metrics'
    });

    // Phase 4: Response Control Commands

    this.register({
      name: 'brief',
      aliases: [],
      category: 'response',
      description: 'Set response mode to brief (concise, minimal explanation)',
      usage: '/brief',
      examples: ['/brief'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 30, window: 60000 },
      handler: 'response.brief'
    });

    this.register({
      name: 'balanced',
      aliases: ['normal'],
      category: 'response',
      description: 'Set response mode to balanced (default, moderate detail)',
      usage: '/balanced',
      examples: ['/balanced', '/normal'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 30, window: 60000 },
      handler: 'response.balanced'
    });

    this.register({
      name: 'detailed',
      aliases: ['verbose'],
      category: 'response',
      description: 'Set response mode to detailed (comprehensive, verbose)',
      usage: '/detailed',
      examples: ['/detailed', '/verbose'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 30, window: 60000 },
      handler: 'response.detailed'
    });

    this.register({
      name: 'code-only',
      aliases: ['codeonly'],
      category: 'response',
      description: 'Only send code without explanation',
      usage: '/code-only',
      examples: ['/code-only', '/codeonly'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 30, window: 60000 },
      handler: 'response.codeOnly'
    });

    this.register({
      name: 'explain-only',
      aliases: ['explainonly'],
      category: 'response',
      description: 'Only send explanation without code',
      usage: '/explain-only',
      examples: ['/explain-only', '/explainonly'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 30, window: 60000 },
      handler: 'response.explainOnly'
    });

    // Phase 7: Context Management Commands

    this.register({
      name: 'focus',
      aliases: ['cwd', 'cd'],
      category: 'context',
      description: 'Set working directory within project',
      usage: '/focus [path]',
      examples: ['/focus', '/focus src/components', '/focus .'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 30, window: 60000 },
      handler: 'context.focus'
    });

    this.register({
      name: 'context',
      aliases: ['ctx'],
      category: 'context',
      description: 'Manage additional context files',
      usage: '/context <add|list|clear> [file]',
      examples: ['/context add src/config.js', '/context list', '/context clear'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 30, window: 60000 },
      handler: 'context.contextAdd' // Will be routed via handler.js
    });

    this.register({
      name: 'ignore',
      aliases: ['ignorepattern'],
      category: 'context',
      description: 'Manage ignore patterns (like .gitignore)',
      usage: '/ignore <pattern|list|clear>',
      examples: ['/ignore *.log', '/ignore node_modules/', '/ignore list', '/ignore clear'],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 30, window: 60000 },
      handler: 'context.ignore' // Will be routed via handler.js
    });

    // Phase 8: Templates & Shortcuts Commands

    this.register({
      name: 'ask',
      aliases: ['q', 'question'],
      category: 'template',
      description: 'Quick question mode with brief, focused answers',
      usage: '/ask <question>',
      examples: [
        '/ask how to handle async errors in node.js',
        '/ask what is the difference between let and const',
        '/ask best practice for error handling'
      ],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 30, window: 60000 },
      handler: 'template.ask',
      validate: (args) => {
        if (args.length === 0) {
          return {
            valid: false,
            error: 'Missing question. Usage: /ask <question>'
          };
        }
        return { valid: true };
      }
    });

    this.register({
      name: 'fix',
      aliases: ['fixerror'],
      category: 'template',
      description: 'Auto-fix error message with root cause analysis',
      usage: '/fix <error message>',
      examples: [
        '/fix TypeError: Cannot read property "map" of undefined',
        '/fix SyntaxError: Unexpected token } at app.js:42',
        '/fix ReferenceError: useState is not defined'
      ],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 20, window: 60000 },
      handler: 'template.fix',
      validate: (args) => {
        if (args.length === 0) {
          return {
            valid: false,
            error: 'Missing error message. Usage: /fix <error message>'
          };
        }
        return { valid: true };
      }
    });

    this.register({
      name: 'review',
      aliases: ['codereview'],
      category: 'template',
      description: 'Comprehensive code review with best practices',
      usage: '/review <file>',
      examples: [
        '/review src/auth/login.js',
        '/review src/utils/validator.ts',
        '/review src/components/UserList.tsx'
      ],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 10, window: 60000 }, // More resource-intensive
      handler: 'template.review',
      validate: (args) => {
        if (args.length === 0) {
          return {
            valid: false,
            error: 'Missing file path. Usage: /review <file>'
          };
        }
        return { valid: true };
      }
    });

    this.register({
      name: 'test',
      aliases: ['unittest', 'generatetest'],
      category: 'template',
      description: 'Generate comprehensive unit tests',
      usage: '/test <file>',
      examples: [
        '/test src/utils/validator.js',
        '/test src/services/auth.ts',
        '/test src/api/users.js'
      ],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 10, window: 60000 }, // More resource-intensive
      handler: 'template.test',
      validate: (args) => {
        if (args.length === 0) {
          return {
            valid: false,
            error: 'Missing file path. Usage: /test <file>'
          };
        }
        return { valid: true };
      }
    });

    this.register({
      name: 'doc',
      aliases: ['document', 'docs'],
      category: 'template',
      description: 'Generate comprehensive documentation',
      usage: '/doc <file>',
      examples: [
        '/doc src/api/users.js',
        '/doc src/utils/helpers.ts',
        '/doc src/services/payment.js'
      ],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 15, window: 60000 },
      handler: 'template.doc',
      validate: (args) => {
        if (args.length === 0) {
          return {
            valid: false,
            error: 'Missing file path. Usage: /doc <file>'
          };
        }
        return { valid: true };
      }
    });

    this.register({
      name: 'refactor',
      aliases: ['improve'],
      category: 'template',
      description: 'Get refactoring suggestions with before/after examples',
      usage: '/refactor <file>',
      examples: [
        '/refactor src/services/payment.js',
        '/refactor src/components/UserList.tsx',
        '/refactor src/utils/database.ts'
      ],
      requiresAuth: true,
      requiresSession: true,
      requiredRole: 'user',
      rateLimit: { calls: 10, window: 60000 }, // More resource-intensive
      handler: 'template.refactor',
      validate: (args) => {
        if (args.length === 0) {
          return {
            valid: false,
            error: 'Missing file path. Usage: /refactor <file>'
          };
        }
        return { valid: true };
      }
    });

    // Phase 9: Admin Commands

    this.register({
      name: 'admin',
      aliases: [],
      category: 'admin',
      description: 'Multi-user management and system administration',
      usage: '/admin <subcommand> [args]',
      examples: [
        '/admin users',
        '/admin kill 6281234567890',
        '/admin stats',
        '/admin whitelist add 6281234567890',
        '/admin grant 6281234567890 admin'
      ],
      requiresAuth: true,
      requiresSession: false,
      requiredRole: 'admin',
      rateLimit: { calls: 30, window: 60000 },
      handler: 'admin.admin'
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
