/**
 * Session Commands
 *
 * Implements session management commands:
 * - /newsession - Create new session
 * - /sessions - List user's sessions
 * - /session <id> - Switch to specific session
 * - /projects - List available projects
 * - /project <name> - Select project for session
 * - /status - Show current session status
 * - /help - Show available commands
 */

import { readdirSync, statSync } from 'fs';
import { join, resolve, basename } from 'path';
import { CommandParser } from './parser.js';

export class SessionCommands {
  /**
   * Create SessionCommands instance
   * @param {Object} options
   * @param {SessionManager} options.sessionManager
   * @param {string} options.projectRootPath - Root path for projects
   */
  constructor(options) {
    this.sessionManager = options.sessionManager;
    this.projectRootPath = resolve(
      options.projectRootPath || process.env.PROJECT_ROOT_PATH || process.cwd()
    );
  }

  /**
   * Execute command
   * @param {string} userId
   * @param {string} message
   * @returns {Promise<string>} Response message
   */
  async execute(userId, message) {
    const parsed = CommandParser.parse(message);

    if (!parsed) {
      return 'Invalid command format';
    }

    const { command, args, rawArgs } = parsed;

    // Validate command
    const validation = CommandParser.validate(command, args);
    if (!validation.valid) {
      return `❌ ${validation.error}`;
    }

    // Execute command
    switch (command) {
      case 'newsession':
        return this.handleNewSession(userId);

      case 'sessions':
        return this.handleListSessions(userId);

      case 'session':
        return this.handleSwitchSession(userId, args[0]);

      case 'closesession':
        return this.handleCloseSession(userId);

      case 'projects':
        return this.handleListProjects();

      case 'project':
        return this.handleSelectProject(userId, rawArgs);

      case 'clear':
        return this.handleClearHistory(userId);

      case 'status':
        return this.handleStatus(userId);

      case 'help':
        return this.handleHelp();

      default:
        return `❌ Unknown command: ${command}. Type /help for available commands.`;
    }
  }

  /**
   * Handle /newsession command
   * @private
   */
  handleNewSession(userId) {
    try {
      const session = this.sessionManager.createSession(userId);

      return `✅ New session created: ${session.sessionId}\n\n` +
             `Next steps:\n` +
             `1. Type /projects to see available projects\n` +
             `2. Type /project <name> to select a project\n` +
             `3. Start coding!`;
    } catch (error) {
      return `❌ Failed to create session: ${error.message}`;
    }
  }

  /**
   * Handle /sessions command
   * @private
   */
  handleListSessions(userId) {
    try {
      const sessions = this.sessionManager.getUserSessions(userId);
      const activeSession = this.sessionManager.getActiveSession(userId);

      if (sessions.length === 0) {
        return `You have no sessions yet. Type /newsession to create one.`;
      }

      let response = `📋 Your sessions (${sessions.length}):\n\n`;

      sessions.forEach((session, index) => {
        const isActive = activeSession && activeSession.sessionId === session.sessionId;
        const marker = isActive ? '👉 ' : '   ';
        const state = this.formatState(session.state);
        const lastActive = this.formatTimestamp(session.lastActive);
        const projectName = session.projectPath ? basename(session.projectPath) : 'No project';

        response += `${marker}${index + 1}. ${session.sessionId}\n`;
        response += `   State: ${state}\n`;
        response += `   Project: ${projectName}\n`;
        response += `   Last active: ${lastActive}\n\n`;
      });

      response += `\nType /session <sessionId> to switch sessions`;

      return response;
    } catch (error) {
      return `❌ Failed to list sessions: ${error.message}`;
    }
  }

  /**
   * Handle /session <id> command
   * @private
   */
  handleSwitchSession(userId, sessionId) {
    try {
      const session = this.sessionManager.switchSession(userId, sessionId);

      const state = this.formatState(session.state);
      const projectName = session.projectPath ? basename(session.projectPath) : 'None';

      return `✅ Switched to session: ${session.sessionId}\n` +
             `State: ${state}\n` +
             `Project: ${projectName}\n\n` +
             (session.state !== 'PROJECT_SELECTED'
               ? `Next: Type /projects to list projects, then /project <name> to select one`
               : `You can now send coding prompts!`);
    } catch (error) {
      return `❌ Failed to switch session: ${error.message}`;
    }
  }

  /**
   * Handle /projects command
   * @private
   */
  handleListProjects() {
    try {
      const projects = this.discoverProjects();

      if (projects.length === 0) {
        return `❌ No projects found in: ${this.projectRootPath}\n\n` +
               `Make sure PROJECT_ROOT_PATH environment variable points to the correct directory.`;
      }

      let response = `📁 Available projects (${projects.length}):\n\n`;

      projects.forEach((project, index) => {
        response += `${index + 1}. ${project.name}\n`;
        response += `   Path: ${project.path}\n\n`;
      });

      response += `\nType /project <name> to select a project`;

      return response;
    } catch (error) {
      return `❌ Failed to list projects: ${error.message}`;
    }
  }

  /**
   * Handle /project <name> command
   * @private
   */
  handleSelectProject(userId, projectName) {
    try {
      // Get active session
      const session = this.sessionManager.getActiveSession(userId);

      if (!session) {
        return `❌ No active session. Type /newsession to create one first.`;
      }

      // Find project
      const projects = this.discoverProjects();
      const project = projects.find(p =>
        p.name.toLowerCase() === projectName.toLowerCase()
      );

      if (!project) {
        return `❌ Project not found: ${projectName}\n\n` +
               `Type /projects to see available projects.`;
      }

      // Set project for session
      this.sessionManager.setSessionProject(session.sessionId, project.path);

      return `✅ Project selected: ${project.name}\n` +
             `Path: ${project.path}\n\n` +
             `You can now send coding prompts! Examples:\n` +
             `- "List all files in this project"\n` +
             `- "Create a new file called hello.js"\n` +
             `- "Show me the main entry point"`;
    } catch (error) {
      return `❌ Failed to select project: ${error.message}`;
    }
  }

  /**
   * Handle /closesession command
   * @private
   */
  handleCloseSession(userId) {
    try {
      const session = this.sessionManager.getActiveSession(userId);

      if (!session) {
        return `❌ No active session to close\n\n` +
               `Type /newsession to create a session.`;
      }

      const sessionId = session.sessionId;
      const projectName = session.projectPath ? basename(session.projectPath) : 'None';

      // Close session
      this.sessionManager.closeSession(sessionId);

      return `✅ Session closed: ${sessionId}\n` +
             `Project: ${projectName}\n\n` +
             `Type /newsession to create a new session, or\n` +
             `Type /sessions to see and switch to another session.`;
    } catch (error) {
      return `❌ Failed to close session: ${error.message}`;
    }
  }

  /**
   * Handle /clear command
   * @private
   */
  handleClearHistory(userId) {
    try {
      const session = this.sessionManager.getActiveSession(userId);

      if (!session) {
        return `❌ No active session\n\n` +
               `Type /newsession to create a session.`;
      }

      if (session.state !== 'PROJECT_SELECTED') {
        return `❌ Cannot clear history - no project selected\n\n` +
               `Type /projects to see available projects, then\n` +
               `Type /project <name> to select one.`;
      }

      // Clear conversation history by restarting spawner
      this.sessionManager.clearSessionHistory(session.sessionId);

      return `✅ Session history cleared\n\n` +
             `Your coding session has been reset with a fresh context.\n` +
             `You can continue with new prompts.`;
    } catch (error) {
      return `❌ Failed to clear history: ${error.message}`;
    }
  }

  /**
   * Handle /status command
   * @private
   */
  handleStatus(userId) {
    try {
      const session = this.sessionManager.getActiveSession(userId);

      if (!session) {
        return `❌ No active session\n\n` +
               `Type /newsession to create a session.`;
      }

      const state = this.formatState(session.state);
      const projectName = session.projectPath ? basename(session.projectPath) : 'None';
      const created = this.formatTimestamp(session.createdAt);
      const lastActive = this.formatTimestamp(session.lastActive);

      let response = `📊 Session Status\n\n`;
      response += `Session ID: ${session.sessionId}\n`;
      response += `State: ${state}\n`;
      response += `Project: ${projectName}\n`;
      response += `Created: ${created}\n`;
      response += `Last active: ${lastActive}\n\n`;

      // Get all user sessions
      const allSessions = this.sessionManager.getUserSessions(userId);
      response += `Total sessions: ${allSessions.length}\n\n`;

      // Next steps based on state
      if (session.state === 'SESSION_SELECTED') {
        response += `Next steps:\n`;
        response += `1. Type /projects to see available projects\n`;
        response += `2. Type /project <name> to select a project`;
      } else if (session.state === 'PROJECT_SELECTED') {
        response += `✅ Ready to code!\n`;
        response += `Send any coding prompt to get started.`;
      }

      return response;
    } catch (error) {
      return `❌ Failed to get status: ${error.message}`;
    }
  }

  /**
   * Handle /help command
   * @private
   */
  handleHelp() {
    const commands = CommandParser.getAvailableCommands();

    let response = `📚 Available Commands\n\n`;

    commands.forEach(cmd => {
      response += `/${cmd.command}\n`;
      response += `  ${cmd.description}\n\n`;
    });

    response += `\nWorkflow:\n`;
    response += `1. /newsession - Create a session\n`;
    response += `2. /projects - See available projects\n`;
    response += `3. /project <name> - Select a project\n`;
    response += `4. Start sending coding prompts!`;

    return response;
  }

  /**
   * Discover projects in PROJECT_ROOT_PATH
   * @private
   * @returns {Array<Object>} Array of { name, path }
   */
  discoverProjects() {
    try {
      const entries = readdirSync(this.projectRootPath);

      const projects = [];

      for (const entry of entries) {
        const fullPath = join(this.projectRootPath, entry);

        try {
          const stats = statSync(fullPath);

          if (stats.isDirectory() && !entry.startsWith('.')) {
            projects.push({
              name: entry,
              path: fullPath
            });
          }
        } catch (err) {
          // Skip entries that can't be stat'd
          continue;
        }
      }

      return projects;
    } catch (error) {
      throw new Error(`Failed to read project root: ${error.message}`);
    }
  }

  /**
   * Format session state for display
   * @private
   */
  formatState(state) {
    const stateEmojis = {
      NO_SESSION: '⚪ Not started',
      SESSION_SELECTED: '🟡 Session created',
      PROJECT_SELECTED: '🟢 Ready to code'
    };

    return stateEmojis[state] || state;
  }

  /**
   * Format timestamp for display
   * @private
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;

    // Less than 1 minute
    if (diff < 60 * 1000) {
      return 'Just now';
    }

    // Less than 1 hour
    if (diff < 60 * 60 * 1000) {
      const minutes = Math.floor(diff / (60 * 1000));
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }

    // Less than 1 day
    if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / (60 * 60 * 1000));
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }

    // More than 1 day
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
}

export default SessionCommands;
