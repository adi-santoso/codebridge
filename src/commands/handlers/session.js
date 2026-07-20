/**
 * Session Management Command Handlers (Phase 2)
 *
 * Handlers for session lifecycle commands:
 * - reset: Clear conversation history
 * - history: View conversation history
 * - save: Save session snapshot
 * - load: Restore session snapshot
 * - sessions: List saved sessions
 * - deleteSession: Delete saved session
 *
 * Note: Full conversation history is not stored by DirectClaudeSpawner.
 * These commands work with session metadata and project context only.
 */

import { Logger } from '../../utils/logger.js';

const logger = new Logger('SessionHandlers');

/**
 * Reset command - Clear conversation history
 * Restarts the Claude subprocess to reset context
 */
export async function reset(context) {
  const { userId, sessionManager } = context;

  // Get active session
  const session = sessionManager.getActiveSession(userId);

  if (!session) {
    return '❌ No active session. Use /newsession to create one.';
  }

  if (session.state !== 'PROJECT_SELECTED') {
    return '❌ Cannot reset - no project selected.\n\nUse /project <name> first.';
  }

  try {
    // Clear session history (restarts spawner)
    await sessionManager.clearSessionHistory(session.sessionId);

    return `✅ *Session Reset*\n\n` +
           `Conversation history cleared.\n` +
           `Session: ${session.sessionId}\n` +
           `Project: ${session.projectPath.split('/').pop()}\n\n` +
           `You can start a fresh conversation now.`;
  } catch (error) {
    logger.error('Reset failed:', error);
    return `❌ Failed to reset session: ${error.message}`;
  }
}

/**
 * History command - Show last N messages
 * Note: DirectClaudeSpawner doesn't store conversation history
 * This command shows command execution history instead
 */
export async function history(context) {
  const { userId, args, flags = {}, db } = context;

  if (!db || !db.getCommandHistory || !db.getCommandHistoryCount) {
    return '❌ Command history not available.\n\nThis feature requires database support.';
  }

  try {
    // Parse limit from args or flags
    let limit = 10; // default
    const maxLimit = parseInt(process.env.SESSION_HISTORY_MAX_LIMIT || '50');
    const defaultLimit = parseInt(process.env.SESSION_HISTORY_DEFAULT_LIMIT || '10');

    if (args.length > 0) {
      limit = parseInt(args[0]);
    } else if (flags.limit) {
      limit = parseInt(flags.limit);
    } else {
      limit = defaultLimit;
    }

    // Validate limit
    if (isNaN(limit) || limit < 1) {
      return `❌ Invalid limit. Usage: /history [n] or /history --limit=N\n\nN must be a positive number.`;
    }

    if (limit > maxLimit) {
      return `❌ Limit too high. Maximum: ${maxLimit}\n\nUsage: /history ${maxLimit}`;
    }

    // Get total count
    const totalCount = db.getCommandHistoryCount(userId);

    if (totalCount === 0) {
      return '📜 *Command History*\n\nNo commands executed yet.';
    }

    // Get history
    const entries = db.getCommandHistory(userId, limit, 0);

    let response = `📜 *Command History*\n\n`;
    response += `Showing last ${entries.length} of ${totalCount} commands:\n\n`;

    entries.forEach((entry, index) => {
      const timestamp = new Date(entry.executedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const successIcon = entry.success ? '✓' : '✗';
      const argsStr = entry.args ? ` ${entry.args}` : '';

      response += `${successIcon} /${entry.command}${argsStr}\n`;
      response += `   ${timestamp}\n`;

      // Show preview of result if available
      if (entry.result && entry.result.length > 0) {
        const preview = entry.result.substring(0, 100);
        const truncated = entry.result.length > 100 ? '...' : '';
        response += `   ${preview}${truncated}\n`;
      }

      response += '\n';
    });

    // Show "and N more" if truncated
    if (totalCount > entries.length) {
      const remaining = totalCount - entries.length;
      response += `... and ${remaining} more commands\n`;
      response += `Use /history ${Math.min(totalCount, maxLimit)} to see more`;
    }

    return response;
  } catch (error) {
    logger.error('History failed:', error);
    return `❌ Failed to get history: ${error.message}`;
  }
}

/**
 * Save command - Save current session snapshot
 */
export async function save(context) {
  const { userId, args, sessionManager, db } = context;

  if (args.length === 0) {
    return `❌ Missing session name.\n\n*Usage:* /save <name>\n*Example:* /save mywork`;
  }

  const name = args[0];

  // Validate name
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return `❌ Invalid name: "${name}"\n\nName must contain only letters, numbers, dashes, and underscores.`;
  }

  if (name.length > 50) {
    return `❌ Name too long (max 50 characters)`;
  }

  try {
    // Get session snapshot
    const snapshot = sessionManager.getSessionSnapshot(userId);

    // Validate snapshot size
    const snapshotJson = JSON.stringify(snapshot);
    const snapshotSize = Buffer.byteLength(snapshotJson, 'utf8');
    const maxSize = parseInt(process.env.SESSION_SNAPSHOT_MAX_SIZE || '10485760'); // 10MB

    if (snapshotSize > maxSize) {
      const sizeMB = (snapshotSize / 1024 / 1024).toFixed(2);
      const maxMB = (maxSize / 1024 / 1024).toFixed(2);
      return `❌ Snapshot too large: ${sizeMB}MB (max: ${maxMB}MB)\n\nConsider starting a fresh session.`;
    }

    // Save to database
    db.saveSessionSnapshot(userId, snapshot.sessionId, name, snapshot);

    const savedCount = db.getSavedSessionCount(userId);
    const maxSaved = parseInt(process.env.SESSION_MAX_SAVED || '10');

    return `✅ *Session Saved*\n\n` +
           `Name: *${name}*\n` +
           `Session: ${snapshot.sessionId}\n` +
           `Project: ${snapshot.projectName || 'None'}\n` +
           `Size: ${(snapshotSize / 1024).toFixed(1)} KB\n` +
           `Saved: ${new Date().toLocaleString()}\n\n` +
           `You have ${savedCount}/${maxSaved} saved sessions.\n\n` +
           `⚠️ *Note:* Conversation history is not saved.\n` +
           `Only project context and session state.`;
  } catch (error) {
    logger.error('Save failed:', error);
    return `❌ Failed to save session: ${error.message}`;
  }
}

/**
 * Load command - Restore saved session
 */
export async function load(context) {
  const { userId, args, sessionManager, db } = context;

  if (args.length === 0) {
    // Show available sessions
    try {
      const savedSessions = db.getSavedSessions(userId, 20, 0);

      if (savedSessions.length === 0) {
        return `📦 *Saved Sessions*\n\nNo saved sessions found.\n\nUse /save <name> to save your current session.`;
      }

      let response = `📦 *Saved Sessions*\n\n`;
      response += `Choose a session to load:\n\n`;

      savedSessions.forEach((saved, index) => {
        const date = new Date(saved.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });

        response += `*${saved.name}*\n`;
        response += `  Session: ${saved.sessionId}\n`;
        response += `  Saved: ${date}\n`;
        response += `  Size: ${(saved.snapshotSize / 1024).toFixed(1)} KB\n\n`;
      });

      response += `*Usage:* /load <name>\n`;
      response += `*Example:* /load ${savedSessions[0].name}`;

      return response;
    } catch (error) {
      logger.error('Load list failed:', error);
      return `❌ Failed to list saved sessions: ${error.message}`;
    }
  }

  const name = args[0];

  try {
    // Get saved session
    const saved = db.getSavedSession(userId, name);

    if (!saved) {
      return `❌ Saved session not found: "${name}"\n\nUse /sessions to see available sessions.`;
    }

    // Parse snapshot
    const snapshot = JSON.parse(saved.snapshot);

    // Restore session
    const restoredSession = await sessionManager.restoreSessionFromSnapshot(userId, snapshot);

    return `✅ *Session Loaded*\n\n` +
           `Name: *${name}*\n` +
           `Session: ${restoredSession.sessionId}\n` +
           `Project: ${snapshot.projectName || 'None'}\n` +
           `Original saved: ${new Date(saved.createdAt).toLocaleDateString()}\n\n` +
           `⚠️ *Note:* Conversation history is not restored.\n` +
           `This is a fresh session with the same project.\n\n` +
           `Ready to code!`;
  } catch (error) {
    logger.error('Load failed:', error);
    return `❌ Failed to load session: ${error.message}`;
  }
}

/**
 * Sessions command - List all saved sessions
 */
export async function sessions(context) {
  const { userId, flags = {}, db } = context;

  try {
    // Parse limit
    const requestedLimit = parseInt(flags.limit) || 10;
    const limit = Math.min(Math.max(requestedLimit, 1), 50);
    const offset = 0; // TODO: Add pagination support

    const savedSessions = db.getSavedSessions(userId, limit, offset);
    const totalCount = db.getSavedSessionCount(userId);
    const maxSaved = parseInt(process.env.SESSION_MAX_SAVED || '10');

    if (totalCount === 0) {
      return `📦 *Saved Sessions*\n\n` +
             `No saved sessions yet.\n\n` +
             `Use /save <name> to save your current session.\n` +
             `You can save up to ${maxSaved} sessions.`;
    }

    let response = `📦 *Saved Sessions* (${totalCount}/${maxSaved})\n\n`;

    savedSessions.forEach((saved, index) => {
      const date = new Date(saved.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      response += `${index + 1}. *${saved.name}*\n`;
      response += `   Session: ${saved.sessionId}\n`;
      response += `   Saved: ${date}\n`;
      response += `   Size: ${(saved.snapshotSize / 1024).toFixed(1)} KB\n\n`;
    });

    // Show "and N more" if truncated
    if (totalCount > savedSessions.length) {
      const remaining = totalCount - savedSessions.length;
      response += `... and ${remaining} more\n`;
      response += `Use /sessions --limit=${totalCount} to see all\n\n`;
    }

    response += `*Commands:*\n`;
    response += `  /load <name> - Load a session\n`;
    response += `  /delete <name> - Delete a session`;

    return response;
  } catch (error) {
    logger.error('Sessions list failed:', error);
    return `❌ Failed to list sessions: ${error.message}`;
  }
}

/**
 * Delete command - Delete saved session
 */
export async function deleteSession(context) {
  const { userId, args, db } = context;

  if (args.length === 0) {
    return `❌ Missing session name.\n\n*Usage:* /delete <name>\n*Example:* /delete mywork`;
  }

  const name = args[0];

  try {
    // Check if exists
    const saved = db.getSavedSession(userId, name);

    if (!saved) {
      return `❌ Saved session not found: "${name}"\n\nUse /sessions to see available sessions.`;
    }

    // Delete
    const deleted = db.deleteSavedSession(userId, name);

    if (deleted) {
      const remainingCount = db.getSavedSessionCount(userId);
      const maxSaved = parseInt(process.env.SESSION_MAX_SAVED || '10');

      return `✅ *Session Deleted*\n\n` +
             `Name: *${name}*\n` +
             `Session: ${saved.sessionId}\n\n` +
             `You have ${remainingCount}/${maxSaved} saved sessions remaining.`;
    } else {
      return `❌ Failed to delete session: "${name}"`;
    }
  } catch (error) {
    logger.error('Delete failed:', error);
    return `❌ Failed to delete session: ${error.message}`;
  }
}

/**
 * Existing session commands (for backward compatibility)
 * These are moved from basic handlers
 */

export async function newsession(context) {
  const { userId, sessionManager } = context;

  try {
    const session = sessionManager.createSession(userId);

    return `✅ *New Session Created*\n\n` +
           `Session ID: ${session.sessionId}\n` +
           `State: ${formatState(session.state)}\n\n` +
           `*Next Steps:*\n` +
           `1. /projects - List available projects\n` +
           `2. /project <name> - Select a project`;
  } catch (error) {
    logger.error('New session failed:', error);
    return `❌ Failed to create session: ${error.message}`;
  }
}

export async function session(context) {
  const { userId, args, sessionManager } = context;

  if (args.length === 0) {
    return `❌ Missing session ID.\n\n*Usage:* /session <sessionId>\n*Example:* /session sess_abc123`;
  }

  const sessionId = args[0];

  try {
    const session = sessionManager.switchSession(userId, sessionId);

    return `✅ *Switched Session*\n\n` +
           `Session ID: ${session.sessionId}\n` +
           `State: ${formatState(session.state)}\n` +
           `Project: ${session.projectPath ? session.projectPath.split('/').pop() : 'None'}\n\n` +
           `Last active: ${formatTimestamp(session.lastActive)}`;
  } catch (error) {
    logger.error('Switch session failed:', error);
    return `❌ Failed to switch session: ${error.message}`;
  }
}

export async function closesession(context) {
  const { userId, sessionManager } = context;

  const session = sessionManager.getActiveSession(userId);

  if (!session) {
    return `❌ No active session to close.`;
  }

  try {
    await sessionManager.closeSession(session.sessionId);

    return `✅ *Session Closed*\n\n` +
           `Session ${session.sessionId} has been closed.\n\n` +
           `Use /newsession to create a new one.`;
  } catch (error) {
    logger.error('Close session failed:', error);
    return `❌ Failed to close session: ${error.message}`;
  }
}

export async function projects(context) {
  const { projectRegistry } = context;

  if (!projectRegistry) {
    return `❌ Project registry not available.`;
  }

  const projects = projectRegistry.getAllProjects();

  if (projects.length === 0) {
    return `📂 *Available Projects*\n\nNo projects configured.\n\nAdd projects to PROJECT_PATHS in .env`;
  }

  let response = `📂 *Available Projects*\n\n`;

  projects.forEach((project, index) => {
    response += `${index + 1}. *${project.name}*\n`;
    response += `   Path: \`${project.path}\`\n`;
    response += `   Description: ${project.description || 'No description'}\n\n`;
  });

  response += `*Usage:* /project <name>\n`;
  response += `*Example:* /project ${projects[0].name}`;

  return response;
}

export async function project(context) {
  const { userId, args, sessionManager, projectRegistry } = context;

  if (args.length === 0) {
    return `❌ Missing project name.\n\n*Usage:* /project <name>\n\nUse /projects to see available projects.`;
  }

  const projectName = args[0];

  if (!projectRegistry) {
    return `❌ Project registry not available.`;
  }

  const proj = projectRegistry.getProjectByName(projectName);

  if (!proj) {
    return `❌ Project not found: "${projectName}"\n\nUse /projects to see available projects.`;
  }

  try {
    const session = sessionManager.getActiveSession(userId);

    if (!session) {
      return `❌ No active session. Use /newsession first.`;
    }

    sessionManager.setSessionProject(session.sessionId, proj.path);

    return `✅ *Project Selected*\n\n` +
           `Name: *${proj.name}*\n` +
           `Path: \`${proj.path}\`\n` +
           `Description: ${proj.description || 'No description'}\n\n` +
           `✅ *Ready to code!*\n` +
           `Send any coding prompt to get started.`;
  } catch (error) {
    logger.error('Select project failed:', error);
    return `❌ Failed to select project: ${error.message}`;
  }
}

export async function clear(context) {
  // Alias for reset
  return reset(context);
}

/**
 * Helper: Format session state
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
 * Helper: Format timestamp
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

export default {
  reset,
  history,
  save,
  load,
  sessions,
  deleteSession,
  newsession,
  session,
  closesession,
  projects,
  project,
  clear
};
