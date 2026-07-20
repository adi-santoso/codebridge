/**
 * Tool Control Command Handlers (Phase 3)
 *
 * Handlers for tool control and visibility:
 * - cancel: Stop current tool execution
 * - retry: Retry last failed command/tool
 * - tools: List available tools with status
 * - allow: Enable specific tool
 * - deny: Disable specific tool
 * - toollog: Show tool execution history
 */

import { Logger } from '../../utils/logger.js';
import {
  getAllTools,
  getToolInfo,
  searchTools,
  getToolsByCategories,
  TOOL_CATEGORIES
} from '../tool-registry.js';

const logger = new Logger('ToolHandlers');

/**
 * Cancel command - Stop current tool execution
 * Note: DirectClaudeSpawner doesn't expose running tool tracking.
 * This is a best-effort implementation that tracks tool state externally.
 */
export async function cancel(context) {
  const { userId, sessionManager } = context;

  const session = sessionManager.getActiveSession(userId);

  if (!session) {
    return '❌ No active session.';
  }

  // Check if there's a tool execution in progress
  // This requires tool executor to track running tools
  const runningTool = sessionManager.getRunningTool?.(userId);

  if (!runningTool) {
    return '⚠️ No tool execution in progress.\n\nNothing to cancel.';
  }

  try {
    // Attempt to cancel (best-effort)
    const cancelled = await sessionManager.cancelTool?.(userId, runningTool.id);

    if (cancelled) {
      return `✅ *Tool Cancellation Requested*\n\n` +
             `Tool: ${runningTool.name}\n` +
             `Started: ${new Date(runningTool.startedAt).toLocaleTimeString()}\n\n` +
             `⚠️ *Note:* Cancellation is best-effort.\n` +
             `Some tools may complete before cancellation takes effect.`;
    } else {
      return `⚠️ *Cannot Cancel Tool*\n\n` +
             `Tool: ${runningTool.name}\n\n` +
             `The tool may have already completed or is not cancellable.`;
    }
  } catch (error) {
    logger.error('Cancel tool failed:', error);
    return `❌ Failed to cancel tool: ${error.message}`;
  }
}

/**
 * Retry command - Retry last failed command/tool
 */
export async function retry(context) {
  const { userId, flags = {}, sessionManager, db } = context;

  const session = sessionManager.getActiveSession(userId);

  if (!session) {
    return '❌ No active session.';
  }

  if (!db || !db.getLastToolExecution) {
    return '❌ Retry not available.\n\nThis feature requires database support.';
  }

  try {
    // Get last tool execution
    const lastExecution = db.getLastToolExecution(userId, session.sessionId);

    if (!lastExecution) {
      return '⚠️ No tool execution found.\n\nNo tools have been executed in this session yet.';
    }

    // Check if --force flag is used
    const forceRetry = flags.force === true || flags.f === true;

    // If last execution succeeded and not forcing, refuse
    if (lastExecution.status === 'success' && !forceRetry) {
      return `⚠️ *Last tool execution succeeded*\n\n` +
             `Tool: ${lastExecution.toolName}\n` +
             `Status: ✅ Success\n` +
             `Executed: ${new Date(lastExecution.executedAt).toLocaleString()}\n\n` +
             `Use \`--force\` flag to retry anyway:\n` +
             `/retry --force`;
    }

    // Show what we're retrying
    const statusIcon = lastExecution.status === 'success' ? '✅' :
                       lastExecution.status === 'cancelled' ? '⚠️' : '❌';

    let response = `🔄 *Retrying Tool Execution*\n\n`;
    response += `Tool: ${lastExecution.toolName}\n`;
    response += `Previous status: ${statusIcon} ${lastExecution.status}\n`;
    response += `Executed: ${new Date(lastExecution.executedAt).toLocaleString()}\n`;

    if (lastExecution.errorMessage) {
      response += `Error: ${lastExecution.errorMessage.substring(0, 100)}\n`;
    }

    response += '\n⏳ Retrying...\n\n';

    // Parse parameters
    let params = null;
    try {
      if (lastExecution.parameters) {
        params = JSON.parse(lastExecution.parameters);
      }
    } catch (err) {
      return `❌ Cannot retry: Failed to parse tool parameters.\n\n` +
             `The tool execution data may be corrupted.`;
    }

    // Store retry context
    if (!sessionManager.setRetryContext) {
      return response + `❌ Retry mechanism not available.\n\n` +
             `The session manager doesn't support tool retry.`;
    }

    // Set retry context for tool executor to pick up
    sessionManager.setRetryContext(userId, {
      toolName: lastExecution.toolName,
      parameters: params,
      originalExecutionId: lastExecution.id
    });

    return response + `✅ Retry context set.\n\n` +
           `Claude will retry the tool execution in the next turn.`;

  } catch (error) {
    logger.error('Retry failed:', error);
    return `❌ Failed to retry: ${error.message}`;
  }
}

/**
 * Tools command - List available tools with status
 */
export async function tools(context) {
  const { userId, args, flags = {}, db } = context;

  // Parse category filter
  const categoryFilter = args.length > 0 ? args[0].toLowerCase() : null;

  // Validate category
  if (categoryFilter && !Object.values(TOOL_CATEGORIES).includes(categoryFilter)) {
    const validCategories = Object.values(TOOL_CATEGORIES).join(', ');
    return `❌ Invalid category: "${categoryFilter}"\n\n` +
           `Valid categories:\n${validCategories}\n\n` +
           `Usage: /tools [category]`;
  }

  try {
    // Get tool stats if database available
    let toolStats = {};
    if (db && db.getToolStats) {
      const stats = db.getToolStats(userId);
      stats.forEach(stat => {
        toolStats[stat.toolName] = {
          count: stat.count,
          successCount: stat.successCount,
          errorCount: stat.errorCount,
          lastUsed: stat.lastUsed
        };
      });
    }

    // Get tool permissions
    let permissions = {};
    if (db && db.getToolPermissions) {
      const perms = db.getToolPermissions(userId);
      perms.forEach(perm => {
        permissions[perm.toolName] = perm.permission;
      });
    }

    // Get tools grouped by category
    const toolsByCategory = getToolsByCategories();

    let response = `🛠️ *Available Tools*\n\n`;

    // Filter by category if specified
    const categories = categoryFilter ?
      [categoryFilter] :
      Object.keys(toolsByCategory).filter(cat => toolsByCategory[cat].length > 0);

    if (categories.length === 0) {
      return `⚠️ No tools found in category: "${categoryFilter}"`;
    }

    for (const category of categories) {
      const categoryTools = toolsByCategory[category];

      if (categoryTools.length === 0) continue;

      response += `📁 *${category.toUpperCase()}*\n`;

      categoryTools.forEach(tool => {
        const permission = permissions[tool.name];
        const stats = toolStats[tool.name];

        // Permission icon
        let permIcon = '⚪'; // No explicit permission
        if (permission === 'allow') permIcon = '✅';
        if (permission === 'deny') permIcon = '❌';

        response += `  ${permIcon} ${tool.name}`;

        // Show usage count if available
        if (stats && stats.count > 0) {
          response += ` (${stats.count}×)`;
        }

        response += '\n';

        // Show description
        response += `     ${tool.description}\n`;
      });

      response += '\n';
    }

    response += `*Legend:*\n`;
    response += `  ✅ Allowed  ❌ Denied  ⚪ Default\n\n`;

    response += `*Commands:*\n`;
    response += `  /allow <tool> - Enable tool\n`;
    response += `  /deny <tool> - Disable tool\n`;
    response += `  /toollog - Show execution history`;

    // Show filter hint if not filtering
    if (!categoryFilter) {
      const cats = Object.values(TOOL_CATEGORIES).join(', ');
      response += `\n\n*Filter by category:*\n/tools <category>\nCategories: ${cats}`;
    }

    return response;
  } catch (error) {
    logger.error('Tools list failed:', error);
    return `❌ Failed to list tools: ${error.message}`;
  }
}

/**
 * Allow command - Enable specific tool
 */
export async function allow(context) {
  const { userId, args, db } = context;

  if (args.length === 0) {
    return `❌ Missing tool name.\n\n*Usage:* /allow <tool>\n*Example:* /allow Bash`;
  }

  if (!db || !db.setToolPermission) {
    return '❌ Tool permissions not available.\n\nThis feature requires database support.';
  }

  const toolPattern = args[0];

  try {
    // Search for matching tools
    const matchingTools = searchTools(toolPattern);

    if (matchingTools.length === 0) {
      return `❌ No tools found matching: "${toolPattern}"\n\n` +
             `Use /tools to see available tools.`;
    }

    // Allow all matching tools
    for (const tool of matchingTools) {
      db.setToolPermission(userId, tool.name, 'allow');
    }

    // Get current whitelist
    const permissions = db.getToolPermissions(userId);
    const whitelist = permissions.filter(p => p.permission === 'allow').map(p => p.toolName);

    let response = `✅ *Tool${matchingTools.length > 1 ? 's' : ''} Enabled*\n\n`;

    matchingTools.forEach(tool => {
      response += `  ✅ ${tool.name} - ${tool.description}\n`;
    });

    response += `\n*Current Whitelist (${whitelist.length}):*\n`;
    if (whitelist.length > 0) {
      whitelist.forEach(name => {
        response += `  • ${name}\n`;
      });
    } else {
      response += `  (none)\n`;
    }

    response += `\n*Permission Mode:* ${process.env.TOOL_PERMISSION_MODE || 'none'}\n\n`;

    if (process.env.TOOL_PERMISSION_MODE === 'whitelist') {
      response += `⚠️ Whitelist mode: Only allowed tools can run.`;
    } else if (process.env.TOOL_PERMISSION_MODE === 'blacklist') {
      response += `ℹ️ Blacklist mode: All tools except denied can run.`;
    } else {
      response += `ℹ️ No permission enforcement active.`;
    }

    return response;
  } catch (error) {
    logger.error('Allow tool failed:', error);
    return `❌ Failed to allow tool: ${error.message}`;
  }
}

/**
 * Deny command - Disable specific tool
 */
export async function deny(context) {
  const { userId, args, db } = context;

  if (args.length === 0) {
    return `❌ Missing tool name.\n\n*Usage:* /deny <tool>\n*Example:* /deny Bash`;
  }

  if (!db || !db.setToolPermission) {
    return '❌ Tool permissions not available.\n\nThis feature requires database support.';
  }

  const toolPattern = args[0];

  try {
    // Search for matching tools
    const matchingTools = searchTools(toolPattern);

    if (matchingTools.length === 0) {
      return `❌ No tools found matching: "${toolPattern}"\n\n` +
             `Use /tools to see available tools.`;
    }

    // Check for critical tools
    const criticalTools = matchingTools.filter(tool => tool.critical);
    if (criticalTools.length > 0) {
      const criticalNames = criticalTools.map(t => t.name).join(', ');
      return `❌ Cannot deny critical tools: ${criticalNames}\n\n` +
             `These tools are essential for system operation.`;
    }

    // Deny all matching tools
    for (const tool of matchingTools) {
      db.setToolPermission(userId, tool.name, 'deny');
    }

    // Get current blacklist
    const permissions = db.getToolPermissions(userId);
    const blacklist = permissions.filter(p => p.permission === 'deny').map(p => p.toolName);

    let response = `🚫 *Tool${matchingTools.length > 1 ? 's' : ''} Disabled*\n\n`;

    matchingTools.forEach(tool => {
      response += `  ❌ ${tool.name} - ${tool.description}\n`;
    });

    response += `\n*Current Blacklist (${blacklist.length}):*\n`;
    if (blacklist.length > 0) {
      blacklist.forEach(name => {
        response += `  • ${name}\n`;
      });
    } else {
      response += `  (none)\n`;
    }

    response += `\n*Permission Mode:* ${process.env.TOOL_PERMISSION_MODE || 'none'}\n\n`;

    if (process.env.TOOL_PERMISSION_MODE === 'blacklist') {
      response += `⚠️ Blacklist mode: Denied tools cannot run.`;
    } else if (process.env.TOOL_PERMISSION_MODE === 'whitelist') {
      response += `ℹ️ Whitelist mode: Only allowed tools can run.`;
    } else {
      response += `ℹ️ No permission enforcement active.`;
    }

    return response;
  } catch (error) {
    logger.error('Deny tool failed:', error);
    return `❌ Failed to deny tool: ${error.message}`;
  }
}

/**
 * Toollog command - Show tool execution history
 */
export async function toollog(context) {
  const { userId, args, flags = {}, db } = context;

  if (!db || !db.getToolAuditLog || !db.getToolAuditCount) {
    return '❌ Tool log not available.\n\nThis feature requires database support.';
  }

  try {
    // Parse limit
    let limit = 10; // default
    const maxLimit = 50;

    if (args.length > 0) {
      limit = parseInt(args[0]);
    } else if (flags.limit) {
      limit = parseInt(flags.limit);
    }

    // Validate limit
    if (isNaN(limit) || limit < 1) {
      return `❌ Invalid limit.\n\n*Usage:* /toollog [n]\n*Example:* /toollog 20`;
    }

    if (limit > maxLimit) {
      return `❌ Limit too high. Maximum: ${maxLimit}`;
    }

    // Parse filters
    const filters = {};
    if (flags.tool) filters.toolName = flags.tool;
    if (flags.status) filters.status = flags.status;

    // Get log entries
    const entries = db.getToolAuditLog(userId, limit, 0, filters);
    const totalCount = db.getToolAuditCount(userId, filters);

    if (totalCount === 0) {
      return '📊 *Tool Execution Log*\n\nNo tool executions yet.';
    }

    let response = `📊 *Tool Execution Log*\n\n`;
    response += `Showing last ${entries.length} of ${totalCount} executions:\n\n`;

    entries.forEach((entry, index) => {
      const timestamp = new Date(entry.executedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      // Status icon
      const statusIcon = entry.status === 'success' ? '✅' :
                        entry.status === 'cancelled' ? '⚠️' : '❌';

      response += `${statusIcon} *${entry.toolName}*\n`;
      response += `   ${timestamp}`;

      // Show duration if available
      if (entry.duration !== null) {
        const durationMs = entry.duration;
        if (durationMs < 1000) {
          response += ` • ${durationMs}ms`;
        } else {
          response += ` • ${(durationMs / 1000).toFixed(1)}s`;
        }
      }

      response += `\n`;

      // Show error message if failed
      if (entry.status === 'error' && entry.errorMessage) {
        const errorPreview = entry.errorMessage.substring(0, 80);
        response += `   Error: ${errorPreview}${entry.errorMessage.length > 80 ? '...' : ''}\n`;
      }

      // Show cancelled by if applicable
      if (entry.status === 'cancelled' && entry.cancelledBy) {
        response += `   Cancelled by: ${entry.cancelledBy}\n`;
      }

      response += '\n';
    });

    // Show "and N more" if truncated
    if (totalCount > entries.length) {
      const remaining = totalCount - entries.length;
      response += `... and ${remaining} more\n`;
      response += `Use /toollog ${Math.min(totalCount, maxLimit)} to see more\n\n`;
    }

    // Show filter hints
    response += `*Filters:*\n`;
    response += `  /toollog --tool=Read - Filter by tool\n`;
    response += `  /toollog --status=error - Filter by status`;

    return response;
  } catch (error) {
    logger.error('Tool log failed:', error);
    return `❌ Failed to get tool log: ${error.message}`;
  }
}

export default {
  cancel,
  retry,
  tools,
  allow,
  deny,
  toollog
};
