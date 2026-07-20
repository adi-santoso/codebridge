/**
 * Admin Command Handlers (Phase 9)
 *
 * Multi-user management and system administration commands
 *
 * Commands:
 * - /admin users - List active users/sessions
 * - /admin kill <userId> - Force close user session
 * - /admin stats - System-wide statistics
 * - /admin reload - Reload configuration
 * - /admin whitelist add <number> - Add to whitelist
 * - /admin whitelist remove <number> - Remove from whitelist
 * - /admin whitelist list - Show all whitelisted numbers
 * - /admin grant <userId> <role> - Grant admin role
 * - /admin revoke <userId> - Revoke admin role
 *
 * Security:
 * - All commands require admin or superadmin role
 * - grant/revoke require superadmin role
 * - All actions are audited
 * - Role hierarchy: user < admin < superadmin
 */

import { Logger } from '../../utils/logger.js';

const logger = new Logger('AdminHandlers');

/**
 * Format duration in human-readable form
 * @param {number} ms - Duration in milliseconds
 * @returns {string}
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Format timestamp to readable date
 * @param {number} timestamp - Unix timestamp
 * @returns {string}
 */
function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Validate phone number format
 * @param {string} phoneNumber
 * @returns {boolean}
 */
function isValidPhoneNumber(phoneNumber) {
  // Basic validation: starts with digits, 8-15 chars
  return /^\d{8,15}$/.test(phoneNumber);
}

/**
 * List active users and sessions
 * @param {Object} context
 * @returns {Promise<string>}
 */
export async function users(context) {
  const { userId, sessionManager, db } = context;

  // Get all active sessions (from SessionManager)
  const allSessions = sessionManager.getAllSessions ? sessionManager.getAllSessions() : [];

  if (allSessions.length === 0) {
    return '📊 *Active Users*\n\nNo active sessions.';
  }

  let response = `📊 *Active Users* (${allSessions.length})\n\n`;

  for (const session of allSessions) {
    const role = db.getUserRole(session.userId);
    const roleIcon = role === 'superadmin' ? '👑' : role === 'admin' ? '⚙️' : '👤';
    const age = formatDuration(Date.now() - session.createdAt);
    const projectName = session.projectPath ? session.projectPath.split('/').pop() : 'None';

    response += `${roleIcon} *${session.userId}*\n`;
    response += `  Session: ${session.sessionId.substring(0, 8)}...\n`;
    response += `  Project: ${projectName}\n`;
    response += `  Age: ${age}\n`;
    response += `  State: ${session.state}\n\n`;
  }

  // Log audit
  db.logAudit(userId, 'LIST_USERS', null, `Listed ${allSessions.length} active sessions`);

  return response;
}

/**
 * Force close a user's session
 * @param {Object} context
 * @returns {Promise<string>}
 */
export async function kill(context) {
  const { userId, args, sessionManager, db } = context;

  if (args.length === 0) {
    return '❌ *Usage*\n\n' +
           '/admin kill <userId>\n\n' +
           '*Example:*\n' +
           '/admin kill 6281234567890';
  }

  const targetUserId = args[0];

  // Don't allow killing own session
  if (targetUserId === userId) {
    return '❌ *Cannot Kill Own Session*\n\n' +
           'You cannot kill your own session.\n' +
           'Use /closesession instead.';
  }

  // Check if target has active session
  const targetSession = sessionManager.getActiveSession(targetUserId);
  if (!targetSession) {
    return `❌ *Session Not Found*\n\n` +
           `User ${targetUserId} has no active session.`;
  }

  // Check role hierarchy (can't kill higher or equal role)
  const adminRole = db.getUserRole(userId);
  const targetRole = db.getUserRole(targetUserId);
  const roleLevel = { user: 0, admin: 1, superadmin: 2 };

  if (roleLevel[targetRole] >= roleLevel[adminRole]) {
    return `❌ *Insufficient Privileges*\n\n` +
           `Cannot kill session of ${targetRole}.\n` +
           `Target user has equal or higher role.`;
  }

  try {
    // Close the session
    await sessionManager.closeSession(targetSession.sessionId);

    // Log audit
    db.logAudit(
      userId,
      'KILL_SESSION',
      targetUserId,
      `Killed session ${targetSession.sessionId}`
    );

    return `✅ *Session Killed*\n\n` +
           `User: ${targetUserId}\n` +
           `Session: ${targetSession.sessionId}\n\n` +
           `User has been disconnected.`;
  } catch (error) {
    logger.error(`Failed to kill session: ${error.message}`);
    return `❌ *Error*\n\n` +
           `Failed to kill session: ${error.message}`;
  }
}

/**
 * Show system-wide statistics
 * @param {Object} context
 * @returns {Promise<string>}
 */
export async function stats(context) {
  const { userId, sessionManager, db } = context;

  // Get stats from database
  const dbStats = db.getSystemStats();

  // Add active sessions from SessionManager
  const allSessions = sessionManager.getAllSessions ? sessionManager.getAllSessions() : [];
  dbStats.activeSessions = allSessions.length;

  let response = `📊 *System Statistics*\n\n`;

  response += `👥 *Users*\n`;
  response += `  Total: ${dbStats.totalUsers}\n`;
  response += `  Active Sessions: ${dbStats.activeSessions}\n`;
  response += `  Admins: ${dbStats.adminCount}\n`;
  response += `  Superadmins: ${dbStats.superadminCount}\n\n`;

  response += `💬 *Commands*\n`;
  response += `  Total Executed: ${dbStats.totalCommands}\n`;
  response += `  Last 24h: ${dbStats.commandsLast24h}\n`;
  response += `  Success Rate: ${dbStats.commandSuccessRate}%\n\n`;

  response += `🛠️ *Tools*\n`;
  response += `  Total Executed: ${dbStats.totalTools}\n`;
  response += `  Last 24h: ${dbStats.toolsLast24h}\n`;
  response += `  Success Rate: ${dbStats.toolSuccessRate}%\n\n`;

  response += `🚨 *Errors*\n`;
  response += `  Total: ${dbStats.totalErrors}\n`;
  response += `  Last 24h: ${dbStats.errorsLast24h}\n\n`;

  response += `📝 *Database*\n`;
  response += `  Saved Sessions: ${dbStats.savedSessions}\n`;
  response += `  Audit Logs: ${dbStats.auditLogs}`;

  // Log audit
  db.logAudit(userId, 'VIEW_STATS', null, 'Viewed system statistics');

  return response;
}

/**
 * Reload configuration from .env
 * @param {Object} context
 * @returns {Promise<string>}
 */
export async function reload(context) {
  const { userId, db } = context;

  try {
    // Re-import dotenv to reload .env
    const dotenv = await import('dotenv');
    const result = dotenv.config();

    if (result.error) {
      throw result.error;
    }

    // Log audit
    db.logAudit(userId, 'RELOAD_CONFIG', null, 'Reloaded configuration from .env');

    return `✅ *Configuration Reloaded*\n\n` +
           `Environment variables have been reloaded from .env file.\n\n` +
           `⚠️ *Note:* Some changes may require application restart to take full effect.`;
  } catch (error) {
    logger.error(`Failed to reload config: ${error.message}`);
    return `❌ *Error*\n\n` +
           `Failed to reload configuration: ${error.message}`;
  }
}

/**
 * Add phone number to whitelist
 * @param {Object} context
 * @returns {Promise<string>}
 */
export async function whitelistAdd(context) {
  const { userId, args, db } = context;

  if (args.length === 0) {
    return '❌ *Usage*\n\n' +
           '/admin whitelist add <phoneNumber> [notes]\n\n' +
           '*Example:*\n' +
           '/admin whitelist add 6281234567890 John Doe\n' +
           '/admin whitelist add 6289876543210';
  }

  const phoneNumber = args[0];
  const notes = args.slice(1).join(' ');

  // Validate phone number
  if (!isValidPhoneNumber(phoneNumber)) {
    return '❌ *Invalid Phone Number*\n\n' +
           `Phone number must be 8-15 digits.\n\n` +
           `Format: 6281234567890 (country code + number)`;
  }

  try {
    // Check if already whitelisted
    const isAlreadyWhitelisted = db.isWhitelisted(phoneNumber);

    // Add to whitelist
    db.addToWhitelist(phoneNumber, userId, notes);

    // Log audit
    db.logAudit(
      userId,
      'WHITELIST_ADD',
      phoneNumber,
      `Added to whitelist${notes ? `: ${notes}` : ''}`
    );

    if (isAlreadyWhitelisted) {
      return `✅ *Whitelist Updated*\n\n` +
             `Phone: ${phoneNumber}\n` +
             `Notes: ${notes || 'None'}\n\n` +
             `⚠️ Number was already whitelisted (updated).`;
    } else {
      return `✅ *Added to Whitelist*\n\n` +
             `Phone: ${phoneNumber}\n` +
             `Notes: ${notes || 'None'}\n\n` +
             `User can now access CodeBridge.`;
    }
  } catch (error) {
    logger.error(`Failed to add to whitelist: ${error.message}`);
    return `❌ *Error*\n\n` +
           `Failed to add to whitelist: ${error.message}`;
  }
}

/**
 * Remove phone number from whitelist
 * @param {Object} context
 * @returns {Promise<string>}
 */
export async function whitelistRemove(context) {
  const { userId, args, db } = context;

  if (args.length === 0) {
    return '❌ *Usage*\n\n' +
           '/admin whitelist remove <phoneNumber>\n\n' +
           '*Example:*\n' +
           '/admin whitelist remove 6281234567890';
  }

  const phoneNumber = args[0];

  // Don't allow removing own number
  if (phoneNumber === userId) {
    return '❌ *Cannot Remove Own Number*\n\n' +
           'You cannot remove your own phone number from the whitelist.';
  }

  try {
    const removed = db.removeFromWhitelist(phoneNumber);

    if (!removed) {
      return `⚠️ *Not Found*\n\n` +
             `Phone number ${phoneNumber} is not in the database whitelist.\n\n` +
             `Note: It may exist in .env file (ALLOWED_USERS).`;
    }

    // Log audit
    db.logAudit(
      userId,
      'WHITELIST_REMOVE',
      phoneNumber,
      'Removed from whitelist'
    );

    return `✅ *Removed from Whitelist*\n\n` +
           `Phone: ${phoneNumber}\n\n` +
           `User can no longer access CodeBridge.`;
  } catch (error) {
    logger.error(`Failed to remove from whitelist: ${error.message}`);
    return `❌ *Error*\n\n` +
           `Failed to remove from whitelist: ${error.message}`;
  }
}

/**
 * List all whitelisted phone numbers
 * @param {Object} context
 * @returns {Promise<string>}
 */
export async function whitelistList(context) {
  const { userId, db } = context;

  try {
    const whitelist = db.getWhitelist();

    if (whitelist.length === 0) {
      return '📋 *Whitelist*\n\n' +
             'No phone numbers in database whitelist.\n\n' +
             `⚠️ Note: Check ALLOWED_USERS in .env for legacy whitelist.`;
    }

    let response = `📋 *Whitelist* (${whitelist.length})\n\n`;

    for (const entry of whitelist) {
      response += `📱 *${entry.phoneNumber}*\n`;
      if (entry.notes) {
        response += `  Notes: ${entry.notes}\n`;
      }
      response += `  Added: ${formatDate(entry.addedAt)}\n`;
      if (entry.addedBy) {
        response += `  By: ${entry.addedBy}\n`;
      }
      response += '\n';
    }

    // Log audit
    db.logAudit(userId, 'WHITELIST_LIST', null, `Viewed whitelist (${whitelist.length} entries)`);

    return response;
  } catch (error) {
    logger.error(`Failed to list whitelist: ${error.message}`);
    return `❌ *Error*\n\n` +
           `Failed to list whitelist: ${error.message}`;
  }
}

/**
 * Grant admin or superadmin role to user
 * @param {Object} context
 * @returns {Promise<string>}
 */
export async function grant(context) {
  const { userId, args, db } = context;

  // This command requires superadmin (checked by middleware)

  if (args.length < 2) {
    return '❌ *Usage*\n\n' +
           '/admin grant <userId> <role>\n\n' +
           '*Roles:* admin, superadmin\n\n' +
           '*Example:*\n' +
           '/admin grant 6281234567890 admin\n' +
           '/admin grant 6289876543210 superadmin';
  }

  const targetUserId = args[0];
  const newRole = args[1].toLowerCase();

  // Validate role
  if (!['admin', 'superadmin'].includes(newRole)) {
    return '❌ *Invalid Role*\n\n' +
           'Role must be: admin or superadmin';
  }

  // Don't allow modifying own role
  if (targetUserId === userId) {
    return '❌ *Cannot Modify Own Role*\n\n' +
           'You cannot change your own role.';
  }

  try {
    const currentRole = db.getUserRole(targetUserId);

    if (currentRole === newRole) {
      return `⚠️ *No Change Needed*\n\n` +
             `User ${targetUserId} already has ${newRole} role.`;
    }

    // Set new role
    db.setUserRole(targetUserId, newRole, userId);

    // Log audit
    db.logAudit(
      userId,
      'GRANT_ROLE',
      targetUserId,
      `Granted ${newRole} role (was ${currentRole})`
    );

    return `✅ *Role Granted*\n\n` +
           `User: ${targetUserId}\n` +
           `New Role: ${newRole}\n` +
           `Previous: ${currentRole}\n\n` +
           `User now has ${newRole} privileges.`;
  } catch (error) {
    logger.error(`Failed to grant role: ${error.message}`);
    return `❌ *Error*\n\n` +
           `Failed to grant role: ${error.message}`;
  }
}

/**
 * Revoke admin role from user (back to user)
 * @param {Object} context
 * @returns {Promise<string>}
 */
export async function revoke(context) {
  const { userId, args, db } = context;

  // This command requires superadmin (checked by middleware)

  if (args.length === 0) {
    return '❌ *Usage*\n\n' +
           '/admin revoke <userId>\n\n' +
           '*Example:*\n' +
           '/admin revoke 6281234567890';
  }

  const targetUserId = args[0];

  // Don't allow revoking own role
  if (targetUserId === userId) {
    return '❌ *Cannot Revoke Own Role*\n\n' +
           'You cannot revoke your own role.';
  }

  try {
    const currentRole = db.getUserRole(targetUserId);

    if (currentRole === 'user') {
      return `⚠️ *Already User Role*\n\n` +
             `User ${targetUserId} already has user role.`;
    }

    // Revoke to user role
    db.setUserRole(targetUserId, 'user', userId);

    // Log audit
    db.logAudit(
      userId,
      'REVOKE_ROLE',
      targetUserId,
      `Revoked ${currentRole} role (now user)`
    );

    return `✅ *Role Revoked*\n\n` +
           `User: ${targetUserId}\n` +
           `Previous Role: ${currentRole}\n` +
           `New Role: user\n\n` +
           `User now has standard user privileges.`;
  } catch (error) {
    logger.error(`Failed to revoke role: ${error.message}`);
    return `❌ *Error*\n\n` +
           `Failed to revoke role: ${error.message}`;
  }
}

/**
 * Main admin command router
 * Routes to sub-commands based on first argument
 * @param {Object} context
 * @returns {Promise<string>}
 */
export async function admin(context) {
  const { args } = context;

  if (args.length === 0) {
    return '📋 *Admin Commands*\n\n' +
           '*User Management:*\n' +
           '/admin users - List active users\n' +
           '/admin kill <userId> - Kill user session\n' +
           '/admin grant <userId> <role> - Grant role (superadmin only)\n' +
           '/admin revoke <userId> - Revoke role (superadmin only)\n\n' +
           '*Whitelist:*\n' +
           '/admin whitelist add <number> [notes]\n' +
           '/admin whitelist remove <number>\n' +
           '/admin whitelist list\n\n' +
           '*System:*\n' +
           '/admin stats - System statistics\n' +
           '/admin reload - Reload configuration';
  }

  const subCommand = args[0].toLowerCase();
  const subArgs = args.slice(1);

  // Create new context with sub-command args
  const subContext = { ...context, args: subArgs };

  // Route to sub-command
  switch (subCommand) {
    case 'users':
      return await users(subContext);

    case 'kill':
      return await kill(subContext);

    case 'stats':
      return await stats(subContext);

    case 'reload':
      return await reload(subContext);

    case 'whitelist':
      if (subArgs.length === 0) {
        return '❌ *Usage*\n\n' +
               '/admin whitelist <add|remove|list> ...\n\n' +
               '*Examples:*\n' +
               '/admin whitelist add 6281234567890\n' +
               '/admin whitelist remove 6281234567890\n' +
               '/admin whitelist list';
      }

      const whitelistAction = subArgs[0].toLowerCase();
      const whitelistArgs = subArgs.slice(1);
      const whitelistContext = { ...context, args: whitelistArgs };

      switch (whitelistAction) {
        case 'add':
          return await whitelistAdd(whitelistContext);
        case 'remove':
          return await whitelistRemove(whitelistContext);
        case 'list':
          return await whitelistList(whitelistContext);
        default:
          return `❌ *Unknown Whitelist Action*\n\n` +
                 `Use: add, remove, or list`;
      }

    case 'grant':
      return await grant(subContext);

    case 'revoke':
      return await revoke(subContext);

    default:
      return `❌ *Unknown Admin Command*\n\n` +
             `Type /admin to see available commands.`;
  }
}

export default {
  admin,
  users,
  kill,
  stats,
  reload,
  whitelistAdd,
  whitelistRemove,
  whitelistList,
  grant,
  revoke
};
