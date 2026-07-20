/**
 * Context Management Command Handlers (Phase 7)
 *
 * Handlers for advanced context control:
 * - focus: Set working directory within project
 * - contextAdd: Add file to additional context
 * - contextList: Show current context files
 * - contextClear: Clear all additional context
 * - ignore: Add ignore pattern
 * - ignoreList: Show current ignore patterns
 * - ignoreClear: Clear all ignore patterns
 */

import fs from 'fs';
import path from 'path';
import { Logger } from '../../utils/logger.js';
import { formatBytes } from '../../utils/ignore-matcher.js';

const logger = new Logger('ContextHandlers');

/**
 * Focus command - Set working directory within project
 * @param {Object} context - Command context
 * @returns {Promise<string>} Response message
 */
export async function focus(context) {
  const { userId, args, sessionManager } = context;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session. Use /newsession to create one.';
  }

  if (session.state !== 'PROJECT_SELECTED') {
    return '❌ No project selected. Use /project <name> first.';
  }

  // No args = show current focus
  if (args.length === 0) {
    const cwd = sessionManager.getWorkingDirectory(userId);
    const relative = path.relative(session.projectPath, cwd);

    return `📍 *Current Focus*\n\n` +
           `Working Directory: ${relative || '(project root)'}\n` +
           `Full Path: \`${cwd}\`\n\n` +
           `💡 All file operations are relative to this directory.`;
  }

  const relativePath = args.join(' ');

  // Validate and set
  try {
    sessionManager.setWorkingDirectory(userId, relativePath);
    const newCwd = sessionManager.getWorkingDirectory(userId);
    const displayPath = path.relative(session.projectPath, newCwd);

    return `✅ *Focus Changed*\n\n` +
           `Working Directory: ${displayPath || '(project root)'}\n` +
           `Full Path: \`${newCwd}\`\n\n` +
           `All file operations will now be relative to this directory.\n\n` +
           `💡 Use \`/focus\` without arguments to see current focus.\n` +
           `💡 Use \`/focus .\` to reset to project root.`;
  } catch (error) {
    logger.error('Focus command failed:', error);
    return `❌ Cannot set focus: ${error.message}`;
  }
}

/**
 * Context Add command - Add file to additional context
 * @param {Object} context - Command context
 * @returns {Promise<string>} Response message
 */
export async function contextAdd(context) {
  const { userId, args, sessionManager } = context;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session. Use /newsession to create one.';
  }

  if (session.state !== 'PROJECT_SELECTED') {
    return '❌ No project selected. Use /project <name> first.';
  }

  if (args.length === 0) {
    return `❌ Missing file path.\n\n` +
           `*Usage:* /context add <file>\n` +
           `*Example:* /context add src/config.js\n\n` +
           `The file will be included in all queries to provide additional context.`;
  }

  const filePath = args.join(' ');

  // Check limits
  const currentContext = sessionManager.getContextFiles(userId);
  const maxFiles = parseInt(process.env.CONTEXT_MAX_FILES || '10');

  if (currentContext.length >= maxFiles) {
    return `❌ Context limit reached (${maxFiles} files).\n\n` +
           `Current files:\n` +
           currentContext.map((f, i) => `  ${i + 1}. ${f.path}`).join('\n') +
           `\n\nUse \`/context clear\` to remove existing files first.`;
  }

  try {
    const fileObj = await sessionManager.addContextFile(userId, filePath);

    const totalSize = currentContext.reduce((sum, f) => sum + f.size, 0) + fileObj.size;
    const maxTotal = parseInt(process.env.CONTEXT_MAX_TOTAL_SIZE || '1048576');

    return `✅ *File Added to Context*\n\n` +
           `📄 ${fileObj.path}\n` +
           `Size: ${formatBytes(fileObj.size)}\n` +
           `Lines: ${fileObj.lines}\n\n` +
           `This file will be included in all queries.\n\n` +
           `Context: ${currentContext.length + 1}/${maxFiles} files (${formatBytes(totalSize)}/${formatBytes(maxTotal)})\n\n` +
           `💡 Use \`/context list\` to see all context files.`;
  } catch (error) {
    logger.error('Context add failed:', error);
    return `❌ Cannot add file: ${error.message}`;
  }
}

/**
 * Context List command - Show current context files
 * @param {Object} context - Command context
 * @returns {Promise<string>} Response message
 */
export async function contextList(context) {
  const { userId, sessionManager } = context;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session. Use /newsession to create one.';
  }

  if (session.state !== 'PROJECT_SELECTED') {
    return '❌ No project selected. Use /project <name> first.';
  }

  const contextFiles = sessionManager.getContextFiles(userId);

  if (contextFiles.length === 0) {
    return `📋 *Additional Context*\n\n` +
           `No context files added.\n\n` +
           `*Usage:* /context add <file>\n` +
           `*Example:* /context add src/config.js`;
  }

  const maxFiles = parseInt(process.env.CONTEXT_MAX_FILES || '10');
  const maxTotal = parseInt(process.env.CONTEXT_MAX_TOTAL_SIZE || '1048576');
  const totalSize = contextFiles.reduce((sum, f) => sum + f.size, 0);

  let response = `📋 *Additional Context* (${contextFiles.length}/${maxFiles})\n\n`;

  contextFiles.forEach((file, index) => {
    const addedDate = new Date(file.addedAt).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    response += `${index + 1}. *${file.path}*\n`;
    response += `   Size: ${formatBytes(file.size)} | Lines: ${file.lines}\n`;
    response += `   Added: ${addedDate}\n\n`;
  });

  response += `*Total Size:* ${formatBytes(totalSize)} / ${formatBytes(maxTotal)}\n\n`;
  response += `These files are included in all queries.\n\n`;
  response += `*Commands:*\n`;
  response += `  /context clear - Remove all context files`;

  return response;
}

/**
 * Context Clear command - Clear all additional context
 * @param {Object} context - Command context
 * @returns {Promise<string>} Response message
 */
export async function contextClear(context) {
  const { userId, sessionManager } = context;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session. Use /newsession to create one.';
  }

  if (session.state !== 'PROJECT_SELECTED') {
    return '❌ No project selected. Use /project <name> first.';
  }

  const contextFiles = sessionManager.getContextFiles(userId);

  if (contextFiles.length === 0) {
    return `📋 *Additional Context*\n\nNo context files to clear.`;
  }

  const count = contextFiles.length;
  const totalSize = contextFiles.reduce((sum, f) => sum + f.size, 0);

  try {
    sessionManager.clearContext(userId);

    return `✅ *Context Cleared*\n\n` +
           `Removed ${count} file${count > 1 ? 's' : ''} (${formatBytes(totalSize)}).\n\n` +
           `Context is now empty.\n\n` +
           `💡 Use \`/context add <file>\` to add files again.`;
  } catch (error) {
    logger.error('Context clear failed:', error);
    return `❌ Failed to clear context: ${error.message}`;
  }
}

/**
 * Ignore command - Add ignore pattern
 * @param {Object} context - Command context
 * @returns {Promise<string>} Response message
 */
export async function ignore(context) {
  const { userId, args, sessionManager } = context;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session. Use /newsession to create one.';
  }

  if (session.state !== 'PROJECT_SELECTED') {
    return '❌ No project selected. Use /project <name> first.';
  }

  if (args.length === 0) {
    return `❌ Missing pattern.\n\n` +
           `*Usage:* /ignore <pattern>\n\n` +
           `*Examples:*\n` +
           `  /ignore *.log          - Ignore all .log files\n` +
           `  /ignore node_modules/  - Ignore directory\n` +
           `  /ignore **/dist        - Ignore dist anywhere\n` +
           `  /ignore !important.log - Don't ignore (negation)\n\n` +
           `💡 Use \`/ignore list\` to see current patterns.`;
  }

  const pattern = args.join(' ');

  // Validate pattern (basic check)
  if (pattern.trim().length === 0) {
    return `❌ Invalid pattern (empty).`;
  }

  try {
    sessionManager.addIgnorePattern(userId, pattern);

    return `✅ *Ignore Pattern Added*\n\n` +
           `Pattern: \`${pattern}\`\n\n` +
           `Files matching this pattern will be excluded from operations.\n\n` +
           `💡 Use \`/ignore list\` to see all patterns.\n` +
           `💡 Patterns follow .gitignore syntax.`;
  } catch (error) {
    logger.error('Ignore command failed:', error);
    return `❌ Cannot add pattern: ${error.message}`;
  }
}

/**
 * Ignore List command - Show current ignore patterns
 * @param {Object} context - Command context
 * @returns {Promise<string>} Response message
 */
export async function ignoreList(context) {
  const { userId, sessionManager } = context;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session. Use /newsession to create one.';
  }

  if (session.state !== 'PROJECT_SELECTED') {
    return '❌ No project selected. Use /project <name> first.';
  }

  const patterns = sessionManager.getIgnorePatterns(userId);

  // Get default patterns
  const defaultPatterns = (process.env.IGNORE_DEFAULT_PATTERNS || 'node_modules,dist,.git')
    .split(',')
    .filter(p => p.trim().length > 0);

  if (patterns.length === 0 && defaultPatterns.length === 0) {
    return `🚫 *Ignore Patterns*\n\n` +
           `No ignore patterns configured.\n\n` +
           `*Usage:* /ignore <pattern>\n` +
           `*Example:* /ignore *.log`;
  }

  let response = `🚫 *Ignore Patterns*\n\n`;

  // Show default patterns
  if (defaultPatterns.length > 0) {
    response += `*Default patterns:*\n`;
    defaultPatterns.forEach((pattern, index) => {
      response += `  ${index + 1}. \`${pattern}\`\n`;
    });
    response += '\n';
  }

  // Show user patterns
  if (patterns.length > 0) {
    response += `*User patterns (${patterns.length}):*\n`;
    patterns.forEach((p, index) => {
      const addedDate = new Date(p.addedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      response += `  ${index + 1}. \`${p.pattern}\`\n`;
      response += `     Added: ${addedDate}\n`;
    });
    response += '\n';
  }

  response += `Files matching these patterns are excluded from operations.\n\n`;
  response += `*Commands:*\n`;
  response += `  /ignore <pattern> - Add pattern\n`;
  response += `  /ignore clear - Remove all user patterns`;

  return response;
}

/**
 * Ignore Clear command - Clear all ignore patterns
 * @param {Object} context - Command context
 * @returns {Promise<string>} Response message
 */
export async function ignoreClear(context) {
  const { userId, sessionManager } = context;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session. Use /newsession to create one.';
  }

  if (session.state !== 'PROJECT_SELECTED') {
    return '❌ No project selected. Use /project <name> first.';
  }

  const patterns = sessionManager.getIgnorePatterns(userId);

  if (patterns.length === 0) {
    return `🚫 *Ignore Patterns*\n\nNo user patterns to clear.\n\n` +
           `Default patterns are still active.`;
  }

  const count = patterns.length;

  try {
    sessionManager.clearIgnorePatterns(userId);

    return `✅ *Ignore Patterns Cleared*\n\n` +
           `Removed ${count} user pattern${count > 1 ? 's' : ''}.\n\n` +
           `Default patterns are still active.\n\n` +
           `💡 Use \`/ignore <pattern>\` to add patterns again.`;
  } catch (error) {
    logger.error('Ignore clear failed:', error);
    return `❌ Failed to clear patterns: ${error.message}`;
  }
}

export default {
  focus,
  contextAdd,
  contextList,
  contextClear,
  ignore,
  ignoreList,
  ignoreClear
};
