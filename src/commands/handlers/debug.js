/**
 * Debug & Info Command Handlers (Phase 6)
 *
 * Handlers for troubleshooting and monitoring:
 * - debugOn: Enable debug mode with detailed logging
 * - debugOff: Disable debug mode
 * - errors: Show recent error history
 * - logs: Show debug logs
 * - metrics: Show session performance metrics
 */

import { Logger } from '../../utils/logger.js';

const logger = new Logger('DebugHandlers');

/**
 * Enable debug mode
 * Enables detailed logging for the user's session
 */
export async function debugOn(context) {
  const { userId, sessionManager, db, logger: userLogger } = context;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session.\n\nUse /newsession to create one.';
  }

  try {
    // Enable debug mode in database
    await db.setUserPreference(userId, 'debugMode', true);

    // Enable debug logging in logger
    if (userLogger && userLogger.setDebugMode) {
      userLogger.setDebugMode(userId, true);
    }

    return `✅ *Debug Mode Enabled*\n\n` +
           `All operations will now be logged in detail.\n\n` +
           `*Commands:*\n` +
           `  /logs - View debug logs\n` +
           `  /errors - View error history\n` +
           `  /metrics - View session metrics\n` +
           `  /debug off - Disable debug mode\n\n` +
           `⚠️ *Note:* Debug logs are kept for ${process.env.DEBUG_LOG_RETENTION_HOURS || '24'} hours.`;
  } catch (error) {
    logger.error('Debug mode enable failed:', error);
    return `❌ Failed to enable debug mode: ${error.message}`;
  }
}

/**
 * Disable debug mode
 * Disables detailed logging and clears buffer
 */
export async function debugOff(context) {
  const { userId, sessionManager, db, logger: userLogger } = context;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session.\n\nUse /newsession to create one.';
  }

  try {
    // Disable debug mode in database
    await db.setUserPreference(userId, 'debugMode', false);

    // Disable debug logging in logger
    if (userLogger && userLogger.setDebugMode) {
      userLogger.setDebugMode(userId, false);
    }

    return `✅ *Debug Mode Disabled*\n\n` +
           `Debug logging has been turned off.\n` +
           `Previous logs have been cleared.\n\n` +
           `Use /debug on to re-enable.`;
  } catch (error) {
    logger.error('Debug mode disable failed:', error);
    return `❌ Failed to disable debug mode: ${error.message}`;
  }
}

/**
 * Show recent errors
 * Display error history with pagination
 */
export async function errors(context) {
  const { userId, args, sessionManager, db } = context;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session.\n\nUse /newsession to create one.';
  }

  try {
    // Parse limit
    const limit = Math.min(Math.max(parseInt(args[0]) || 10, 1), 50);

    // Get error history
    const errorList = await db.getErrorHistory(userId, limit, 0);
    const totalCount = await db.getErrorCount(userId);

    if (errorList.length === 0) {
      return `✅ *No Errors Found*\n\n` +
             `Your session is clean! No errors recorded.\n\n` +
             `Errors are automatically logged when:\n` +
             `  • Commands fail\n` +
             `  • Tool execution errors occur\n` +
             `  • System exceptions happen`;
    }

    // Group errors by session
    const errorsBySession = groupErrorsBySession(errorList);

    let response = `🚨 *Recent Errors* (${errorList.length}/${totalCount})\n\n`;

    for (const [sessionId, sessionErrors] of Object.entries(errorsBySession)) {
      const isCurrentSession = sessionId === session.sessionId;
      const sessionLabel = isCurrentSession ? '🟢 Current Session' : `Session ${sessionId}`;

      response += `*${sessionLabel}*\n`;

      sessionErrors.forEach((error, index) => {
        const timestamp = new Date(error.occurredAt).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const errorIcon = getErrorIcon(error.errorType);
        response += `\n${errorIcon} *${error.errorType}*\n`;
        response += `   ${timestamp}\n`;
        response += `   ${truncateText(error.errorMessage, 100)}\n`;

        // Show context if available
        if (error.context) {
          try {
            const ctx = JSON.parse(error.context);
            if (ctx.command) {
              response += `   Command: /${ctx.command}\n`;
            }
          } catch (e) {
            // Ignore JSON parse errors
          }
        }
      });

      response += '\n';
    }

    // Pagination info
    if (totalCount > limit) {
      const remaining = totalCount - limit;
      response += `\n... and ${remaining} more errors\n`;
      response += `Use /errors ${Math.min(totalCount, 50)} to see more`;
    }

    return response;
  } catch (error) {
    logger.error('Errors command failed:', error);
    return `❌ Failed to retrieve errors: ${error.message}`;
  }
}

/**
 * Show debug logs
 * Display recent log entries (requires debug mode)
 */
export async function logs(context) {
  const { userId, args, sessionManager, db, logger: userLogger } = context;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session.\n\nUse /newsession to create one.';
  }

  try {
    // Check if debug mode is enabled
    const prefs = await db.getUserPreferences(userId);
    const debugEnabled = prefs && prefs.debugMode;

    if (!debugEnabled) {
      return `⚠️ *Debug Mode Disabled*\n\n` +
             `Debug logging is currently disabled.\n\n` +
             `Enable it with: /debug on\n\n` +
             `Once enabled, logs will be captured for:\n` +
             `  • Command execution\n` +
             `  • Tool operations\n` +
             `  • System events`;
    }

    // Parse limit
    const limit = Math.min(Math.max(parseInt(args[0]) || 50, 1), 200);

    // Get debug logs from logger
    if (!userLogger || !userLogger.getDebugLogs) {
      return `❌ Debug logs not available.\n\nLogger does not support debug mode.`;
    }

    const logEntries = userLogger.getDebugLogs(userId, limit);

    if (logEntries.length === 0) {
      return `📋 *Debug Logs*\n\n` +
             `No logs captured yet.\n\n` +
             `Logs will appear here as you use commands and tools.`;
    }

    let response = `📋 *Debug Logs* (Last ${logEntries.length})\n\n`;

    logEntries.forEach((entry) => {
      const timestamp = new Date(entry.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const levelIcon = getLogLevelIcon(entry.level);
      const message = truncateText(entry.message, 150);

      response += `${levelIcon} ${timestamp} - ${message}\n`;
    });

    response += `\n💡 Use /debug off to stop logging`;

    return response;
  } catch (error) {
    logger.error('Logs command failed:', error);
    return `❌ Failed to retrieve logs: ${error.message}`;
  }
}

/**
 * Show session metrics
 * Display comprehensive session statistics
 */
export async function metrics(context) {
  const { userId, sessionManager, db } = context;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session.\n\nUse /newsession to create one.';
  }

  try {
    // Get metrics from database
    const sessionMetrics = await db.getSessionMetrics(userId, session.sessionId);

    if (!sessionMetrics) {
      return `❌ Metrics not available for this session.`;
    }

    let response = `📊 *Session Metrics*\n\n`;

    // Session info
    response += `*Session Info*\n`;
    response += `  ID: ${session.sessionId}\n`;
    response += `  Created: ${formatTimestamp(session.createdAt)}\n`;
    response += `  Last Active: ${formatTimestamp(session.lastActive)}\n`;
    response += `  Age: ${formatDuration(Date.now() - session.createdAt)}\n\n`;

    // Command statistics
    response += `*Commands*\n`;
    response += `  Total: ${sessionMetrics.commandCount || 0}\n`;
    response += `  Success: ${sessionMetrics.commandSuccess || 0}\n`;
    response += `  Failed: ${sessionMetrics.commandFailed || 0}\n`;

    if (sessionMetrics.commandCount > 0) {
      const successRate = Math.round((sessionMetrics.commandSuccess / sessionMetrics.commandCount) * 100);
      response += `  Success Rate: ${successRate}%\n`;
    }

    // Top commands
    if (sessionMetrics.topCommands && sessionMetrics.topCommands.length > 0) {
      response += `  Top Commands:\n`;
      sessionMetrics.topCommands.slice(0, 3).forEach(cmd => {
        response += `    • /${cmd.command} (${cmd.count})\n`;
      });
    }

    response += '\n';

    // Tool statistics
    response += `*Tool Execution*\n`;
    response += `  Total: ${sessionMetrics.toolCount || 0}\n`;
    response += `  Success: ${sessionMetrics.toolSuccess || 0}\n`;
    response += `  Failed: ${sessionMetrics.toolFailed || 0}\n`;
    response += `  Cancelled: ${sessionMetrics.toolCancelled || 0}\n`;

    if (sessionMetrics.toolCount > 0) {
      const toolSuccessRate = Math.round((sessionMetrics.toolSuccess / sessionMetrics.toolCount) * 100);
      response += `  Success Rate: ${toolSuccessRate}%\n`;
    }

    if (sessionMetrics.avgToolDuration) {
      response += `  Avg Duration: ${Math.round(sessionMetrics.avgToolDuration)}ms\n`;
    }

    // Top tools
    if (sessionMetrics.topTools && sessionMetrics.topTools.length > 0) {
      response += `  Top Tools:\n`;
      sessionMetrics.topTools.slice(0, 3).forEach(tool => {
        response += `    • ${tool.toolName} (${tool.count})\n`;
      });
    }

    response += '\n';

    // Error statistics
    response += `*Errors*\n`;
    response += `  Total: ${sessionMetrics.errorCount || 0}\n`;

    if (sessionMetrics.errorsByType && sessionMetrics.errorsByType.length > 0) {
      response += `  By Type:\n`;
      sessionMetrics.errorsByType.forEach(type => {
        response += `    • ${type.errorType}: ${type.count}\n`;
      });
    }

    // Performance indicator
    response += `\n`;
    const healthScore = calculateHealthScore(sessionMetrics);
    response += `*Health Score:* ${getHealthEmoji(healthScore)} ${healthScore}/100\n`;

    return response;
  } catch (error) {
    logger.error('Metrics command failed:', error);
    return `❌ Failed to retrieve metrics: ${error.message}`;
  }
}

/**
 * Helper: Group errors by session
 */
function groupErrorsBySession(errors) {
  const grouped = {};

  errors.forEach(error => {
    const sessionId = error.sessionId || 'unknown';
    if (!grouped[sessionId]) {
      grouped[sessionId] = [];
    }
    grouped[sessionId].push(error);
  });

  return grouped;
}

/**
 * Helper: Get error icon by type
 */
function getErrorIcon(errorType) {
  const icons = {
    'COMMAND_ERROR': '⚠️',
    'TOOL_ERROR': '🔧',
    'VALIDATION_ERROR': '❗',
    'PERMISSION_ERROR': '🔒',
    'TIMEOUT_ERROR': '⏱️',
    'SYSTEM_ERROR': '💥'
  };

  return icons[errorType] || '❌';
}

/**
 * Helper: Get log level icon
 */
function getLogLevelIcon(level) {
  const icons = {
    'error': '❌',
    'warn': '⚠️',
    'info': 'ℹ️',
    'debug': '🔍',
    'success': '✅'
  };

  return icons[level] || '📝';
}

/**
 * Helper: Truncate text
 */
function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
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
    return `${minutes}m ago`;
  }

  // Less than 1 day
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours}h ago`;
  }

  // Format as date
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Helper: Format duration
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Helper: Calculate health score
 */
function calculateHealthScore(metrics) {
  let score = 100;

  // Deduct for command failures
  if (metrics.commandCount > 0) {
    const commandFailRate = (metrics.commandFailed / metrics.commandCount) * 100;
    score -= commandFailRate * 0.3;
  }

  // Deduct for tool failures
  if (metrics.toolCount > 0) {
    const toolFailRate = (metrics.toolFailed / metrics.toolCount) * 100;
    score -= toolFailRate * 0.4;
  }

  // Deduct for errors
  if (metrics.errorCount > 0) {
    score -= Math.min(metrics.errorCount * 2, 30);
  }

  return Math.max(Math.round(score), 0);
}

/**
 * Helper: Get health emoji
 */
function getHealthEmoji(score) {
  if (score >= 90) return '🟢';
  if (score >= 70) return '🟡';
  if (score >= 50) return '🟠';
  return '🔴';
}

export default {
  debugOn,
  debugOff,
  errors,
  logs,
  metrics
};
