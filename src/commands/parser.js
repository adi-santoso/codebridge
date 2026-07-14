/**
 * Command Parser
 *
 * Parses user commands like /newsession, /sessions, /project, etc.
 * Enhanced with flag parsing and better validation
 */

export class CommandParser {
  /**
   * Check if message is a command
   * @param {string} message
   * @returns {boolean}
   */
  static isCommand(message) {
    if (!message || typeof message !== 'string') {
      return false;
    }
    return message.trim().startsWith('/');
  }

  /**
   * Parse command from message
   * Enhanced to support flags and options
   * @param {string} message
   * @returns {Object} { command, args, rawArgs, flags }
   */
  static parse(message) {
    const trimmed = message.trim();

    if (!trimmed.startsWith('/')) {
      return null;
    }

    // Split by whitespace
    const parts = trimmed.split(/\s+/);
    const command = parts[0].substring(1).toLowerCase(); // Remove '/' and lowercase
    const rawParts = parts.slice(1);

    // Parse flags and arguments
    const flags = {};
    const args = [];

    for (let i = 0; i < rawParts.length; i++) {
      const part = rawParts[i];

      // Check for flags (--flag or --flag=value)
      if (part.startsWith('--')) {
        const flagPart = part.substring(2);
        const [flagName, ...flagValueParts] = flagPart.split('=');
        const flagValue = flagValueParts.join('=');

        flags[flagName] = flagValue || true;
      }
      // Check for short flags (-f)
      else if (part.startsWith('-') && part.length === 2) {
        flags[part.substring(1)] = true;
      }
      // Regular argument
      else {
        args.push(part);
      }
    }

    return {
      command,
      args,
      rawArgs: args.join(' '),
      flags,
      originalMessage: message
    };
  }

  /**
   * Get command description
   * @param {string} command
   * @returns {string}
   */
  static getDescription(command) {
    const descriptions = {
      // Session commands
      newsession: 'Create a new session',
      sessions: 'List all your sessions',
      session: 'Switch to a specific session (usage: /session <sessionId>)',
      closesession: 'Close current session',
      clear: 'Clear conversation history',

      // Project commands
      projects: 'List available projects',
      project: 'Select project for current session (usage: /project <projectName>)',

      // Basic commands
      help: 'Show available commands',
      ping: 'Check if CodeBridge is alive',
      version: 'Show CodeBridge version',
      status: 'Show current session status'
    };

    return descriptions[command] || 'Unknown command';
  }

  /**
   * Get all available commands
   * @returns {Array<Object>}
   */
  static getAvailableCommands() {
    return [
      // Session management
      { command: 'newsession', description: 'Create a new session' },
      { command: 'sessions', description: 'List all your sessions' },
      { command: 'session <id>', description: 'Switch to a specific session' },
      { command: 'closesession', description: 'Close current session' },
      { command: 'clear', description: 'Clear conversation history' },

      // Project management
      { command: 'projects', description: 'List available projects' },
      { command: 'project <name>', description: 'Select project for current session' },

      // Basic commands
      { command: 'help [command]', description: 'Show this help message or help for specific command' },
      { command: 'ping', description: 'Health check' },
      { command: 'version', description: 'Show version info' },
      { command: 'status', description: 'Show current session status' }
    ];
  }

  /**
   * Validate command arguments
   * @param {string} command
   * @param {Array<string>} args
   * @returns {Object} { valid: boolean, error?: string }
   */
  static validate(command, args) {
    switch (command) {
      case 'session':
        if (args.length === 0) {
          return {
            valid: false,
            error: 'Missing session ID. Usage: /session <sessionId>'
          };
        }
        return { valid: true };

      case 'project':
        if (args.length === 0) {
          return {
            valid: false,
            error: 'Missing project name. Usage: /project <projectName>'
          };
        }
        return { valid: true };

      case 'newsession':
      case 'sessions':
      case 'projects':
      case 'status':
      case 'help':
      case 'ping':
      case 'version':
      case 'clear':
      case 'closesession':
        return { valid: true };

      default:
        return {
          valid: false,
          error: `Unknown command: ${command}. Type /help for available commands.`
        };
    }
  }

  /**
   * Sanitize command input
   * @param {string} input
   * @returns {string}
   */
  static sanitize(input) {
    if (!input || typeof input !== 'string') {
      return '';
    }

    // Remove potentially dangerous characters
    return input
      .trim()
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
      .substring(0, 1000); // Limit length
  }
}

export default CommandParser;
