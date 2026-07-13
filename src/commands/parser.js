/**
 * Command Parser
 *
 * Parses user commands like /newsession, /sessions, /project, etc.
 */

export class CommandParser {
  /**
   * Check if message is a command
   * @param {string} message
   * @returns {boolean}
   */
  static isCommand(message) {
    return message.trim().startsWith('/');
  }

  /**
   * Parse command from message
   * @param {string} message
   * @returns {Object} { command, args }
   */
  static parse(message) {
    const trimmed = message.trim();

    if (!trimmed.startsWith('/')) {
      return null;
    }

    // Split by whitespace
    const parts = trimmed.split(/\s+/);
    const command = parts[0].substring(1).toLowerCase(); // Remove '/' and lowercase
    const args = parts.slice(1);

    return {
      command,
      args,
      rawArgs: parts.slice(1).join(' ')
    };
  }

  /**
   * Get command description
   * @param {string} command
   * @returns {string}
   */
  static getDescription(command) {
    const descriptions = {
      newsession: 'Create a new session',
      sessions: 'List all your sessions',
      session: 'Switch to a specific session (usage: /session <sessionId>)',
      projects: 'List available projects',
      project: 'Select project for current session (usage: /project <projectName>)',
      status: 'Show current session status',
      help: 'Show available commands'
    };

    return descriptions[command] || 'Unknown command';
  }

  /**
   * Get all available commands
   * @returns {Array<Object>}
   */
  static getAvailableCommands() {
    return [
      { command: 'newsession', description: 'Create a new session' },
      { command: 'sessions', description: 'List all your sessions' },
      { command: 'session <id>', description: 'Switch to a specific session' },
      { command: 'projects', description: 'List available projects' },
      { command: 'project <name>', description: 'Select project for current session' },
      { command: 'status', description: 'Show current session status' },
      { command: 'help', description: 'Show this help message' }
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
        return { valid: true };

      default:
        return {
          valid: false,
          error: `Unknown command: ${command}. Type /help for available commands.`
        };
    }
  }
}

export default CommandParser;
