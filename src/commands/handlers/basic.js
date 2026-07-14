/**
 * Basic Command Handlers
 *
 * Handlers for basic commands:
 * - help: List available commands
 * - ping: Health check with latency
 * - version: Show CodeBridge version
 * - status: Show current session status with stats
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Help command handler
 * Lists all available commands grouped by category
 */
export async function help(context) {
  const { args, registry } = context;

  // If specific command requested
  if (args.length > 0) {
    const commandName = args[0];
    const command = registry.get(commandName);

    if (!command) {
      return `❌ Unknown command: /${commandName}\n\nType /help to see all available commands.`;
    }

    // Show detailed help for specific command
    let response = `📚 *Help: /${command.name}*\n\n`;
    response += `${command.description}\n\n`;
    response += `*Usage:* ${command.usage}\n\n`;

    if (command.aliases.length > 0) {
      response += `*Aliases:* ${command.aliases.map(a => `/${a}`).join(', ')}\n\n`;
    }

    if (command.examples.length > 0) {
      response += `*Examples:*\n`;
      command.examples.forEach(example => {
        response += `  ${example}\n`;
      });
      response += '\n';
    }

    response += `*Category:* ${command.category}\n`;

    if (command.requiresSession) {
      response += `⚠️ Requires active session\n`;
    }

    return response;
  }

  // Show all commands grouped by category
  const categories = registry.getCategories();
  let response = `📚 *Available Commands*\n\n`;

  for (const category of categories) {
    const commands = registry.getByCategory(category);

    // Capitalize category name
    const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
    response += `*${categoryName}*\n`;

    commands.forEach(cmd => {
      const aliases = cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
      response += `  /${cmd.name}${aliases}\n`;
      response += `    ${cmd.description}\n`;
    });

    response += '\n';
  }

  response += `Type /help <command> for detailed help\n`;
  response += `Example: /help status`;

  return response;
}

/**
 * Ping command handler
 * Returns pong with latency and timestamp
 */
export async function ping(context) {
  const { userId } = context;
  const timestamp = Date.now();

  // Simple latency measurement (not accurate for WhatsApp, but useful)
  const startTime = process.hrtime.bigint();

  // Simulate some work
  await new Promise(resolve => setTimeout(resolve, 1));

  const endTime = process.hrtime.bigint();
  const latencyNs = endTime - startTime;
  const latencyMs = Number(latencyNs) / 1_000_000;

  return `🏓 *Pong!*\n\n` +
         `✅ CodeBridge is alive and responding\n\n` +
         `*Response Time:* ${latencyMs.toFixed(2)}ms\n` +
         `*Timestamp:* ${new Date(timestamp).toISOString()}\n` +
         `*User ID:* ${userId}`;
}

/**
 * Version command handler
 * Shows CodeBridge version and environment info
 */
export async function version(context) {
  // Read package.json for version
  let packageJson;
  try {
    const packagePath = resolve(process.cwd(), 'package.json');
    const packageData = readFileSync(packagePath, 'utf-8');
    packageJson = JSON.parse(packageData);
  } catch (error) {
    packageJson = { version: 'unknown', name: 'codebridge' };
  }

  const version = packageJson.version || 'unknown';
  const name = packageJson.name || 'CodeBridge';

  // Get Node.js version
  const nodeVersion = process.version;

  // Get environment
  const env = process.env.NODE_ENV || 'production';

  // Get uptime
  const uptimeSeconds = process.uptime();
  const uptimeFormatted = formatUptime(uptimeSeconds);

  // Get dependencies versions
  const deps = packageJson.dependencies || {};
  const anthropicVersion = deps['@anthropic-ai/sdk'] || 'N/A';
  const socketIoVersion = deps['socket.io-client'] || 'N/A';

  return `ℹ️ *${name} Version Info*\n\n` +
         `*Version:* ${version}\n` +
         `*Node.js:* ${nodeVersion}\n` +
         `*Environment:* ${env}\n` +
         `*Uptime:* ${uptimeFormatted}\n\n` +
         `*Dependencies:*\n` +
         `  • Anthropic SDK: ${anthropicVersion}\n` +
         `  • Socket.IO: ${socketIoVersion}\n\n` +
         `*Platform:* ${process.platform}\n` +
         `*Architecture:* ${process.arch}`;
}

/**
 * Status command handler (enhanced)
 * Shows current session status with detailed statistics
 * Supports --limit flag for command history pagination
 */
export async function status(context) {
  const { userId, sessionManager, db, flags = {} } = context;

  // Get active session
  const session = sessionManager.getActiveSession(userId);

  // Get all user sessions
  const allSessions = sessionManager.getUserSessions(userId);

  // Get session stats
  let sessionStats = { NO_SESSION: 0, SESSION_SELECTED: 0, PROJECT_SELECTED: 0 };
  if (db && db.getSessionStats) {
    try {
      sessionStats = db.getSessionStats();
    } catch (error) {
      // Ignore - use defaults
    }
  }

  let response = `📊 *CodeBridge Status*\n\n`;

  // Current session info
  if (session) {
    const state = formatState(session.state);
    const projectName = session.projectPath ? session.projectPath.split('/').pop() : 'None';
    const created = formatTimestamp(session.createdAt);
    const lastActive = formatTimestamp(session.lastActive);

    response += `*Current Session:*\n`;
    response += `  ID: ${session.sessionId}\n`;
    response += `  State: ${state}\n`;
    response += `  Project: ${projectName}\n`;
    response += `  Created: ${created}\n`;
    response += `  Last active: ${lastActive}\n\n`;
  } else {
    response += `*Current Session:* None\n`;
    response += `Type /newsession to create one\n\n`;
  }

  // User sessions
  response += `*Your Sessions:*\n`;
  response += `  Total: ${allSessions.length}\n`;
  response += `  Active: ${allSessions.filter(s => s.state === 'PROJECT_SELECTED').length}\n\n`;

  // System-wide stats
  const totalSessions = sessionManager.getTotalSessions();
  const activeSessions = sessionManager.getActiveSessions();

  response += `*System Stats:*\n`;
  response += `  Total sessions: ${totalSessions}\n`;
  response += `  Active sessions: ${activeSessions.length}\n`;
  response += `  Ready sessions: ${sessionStats.PROJECT_SELECTED || 0}\n\n`;

  // Command history with pagination (if available)
  if (db && db.getCommandHistory && db.getCommandHistoryCount) {
    try {
      const totalCommands = db.getCommandHistoryCount(userId);

      if (totalCommands > 0) {
        // Parse limit from flags (default: 10, max: 100)
        const requestedLimit = parseInt(flags.limit) || 10;
        const limit = Math.min(Math.max(requestedLimit, 1), 100);

        const history = db.getCommandHistory(userId, limit, 0);

        response += `*Your Command History:*\n`;
        response += `  Total commands executed: ${totalCommands}\n`;
        response += `  Recent commands (last ${history.length}):\n`;

        history.forEach((entry, index) => {
          const timeAgo = formatTimestamp(entry.executedAt);
          const successIcon = entry.success ? '✓' : '✗';
          response += `    ${successIcon} /${entry.command} - ${timeAgo}\n`;
        });

        // Show "and N more" if there are more results
        if (totalCommands > history.length) {
          const remaining = totalCommands - history.length;
          response += `    ... and ${remaining} more\n`;
          response += `    (Use /status --limit=N to see more, max 100)\n`;
        }

        response += '\n';
      }
    } catch (error) {
      // Ignore - optional feature
    }
  }

  // Next steps based on state
  if (!session) {
    response += `*Next Steps:*\n`;
    response += `1. /newsession - Create a session\n`;
    response += `2. /projects - See available projects\n`;
    response += `3. /project <name> - Select a project`;
  } else if (session.state === 'SESSION_SELECTED') {
    response += `*Next Steps:*\n`;
    response += `1. /projects - See available projects\n`;
    response += `2. /project <name> - Select a project`;
  } else if (session.state === 'PROJECT_SELECTED') {
    response += `✅ *Ready to code!*\n`;
    response += `Send any coding prompt to get started.`;
  }

  return response;
}

/**
 * Format session state for display
 * @private
 */
function formatState(state) {
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
function formatTimestamp(timestamp) {
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

/**
 * Format uptime for display
 * @private
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

export default {
  help,
  ping,
  version,
  status
};
