/**
 * File Operations Command Handlers (Phase 4)
 *
 * Handlers for file operations:
 * - ls: List directory contents
 * - cat: Read file content
 * - tree: Show directory tree
 * - search: Search in files (grep-like)
 * - diff: Show git diff
 */

import fs from 'fs';
import path from 'path';
import { Logger } from '../../utils/logger.js';
import {
  checkPathSecurity,
  readFileSmart,
  generateTree,
  searchInFiles,
  getGitDiff,
  formatForWhatsApp
} from '../../utils/file-ops.js';

const logger = new Logger('FileHandlers');

/**
 * List directory contents
 * @param {Object} context - Command context
 * @returns {Promise<string>} Response message
 */
export async function ls(context) {
  const { userId, args, sessionManager } = context;

  // Get active session
  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session. Use /newsession to create one.';
  }

  if (session.state !== 'PROJECT_SELECTED') {
    return '❌ No project selected. Use /project <name> first.';
  }

  // Parse path argument (default: current directory)
  const requestedPath = args.length > 0 ? args.join(' ') : '.';

  // Validate path security
  const securityCheck = checkPathSecurity(requestedPath, session.projectPath);
  if (!securityCheck.safe) {
    return `❌ Security error: ${securityCheck.error}`;
  }

  const targetPath = securityCheck.resolvedPath;

  try {
    // Check if path exists
    if (!fs.existsSync(targetPath)) {
      return `❌ Path not found: ${requestedPath}`;
    }

    const stats = fs.statSync(targetPath);

    // If it's a file, show file info
    if (stats.isFile()) {
      const fileName = path.basename(targetPath);
      const fileSize = stats.size;
      const modified = stats.mtime.toLocaleString();

      return `📄 *File Info*\n\n` +
             `Name: ${fileName}\n` +
             `Size: ${formatFileSize(fileSize)}\n` +
             `Modified: ${modified}\n\n` +
             `💡 Use \`/cat ${requestedPath}\` to read the file`;
    }

    // It's a directory - list contents
    const entries = fs.readdirSync(targetPath, { withFileTypes: true });

    // Separate directories and files
    const dirs = entries.filter(e => e.isDirectory());
    const files = entries.filter(e => e.isFile());

    // Sort alphabetically
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    let response = `📁 *Directory: ${requestedPath === '.' ? '/' : requestedPath}*\n\n`;

    // Show directories
    if (dirs.length > 0) {
      response += `*Directories (${dirs.length}):*\n`;
      for (const dir of dirs) {
        // Skip hidden directories
        if (dir.name.startsWith('.')) continue;

        response += `  📁 ${dir.name}/\n`;
      }
      response += '\n';
    }

    // Show files
    if (files.length > 0) {
      response += `*Files (${files.length}):*\n`;
      for (const file of files) {
        // Skip hidden files
        if (file.name.startsWith('.')) continue;

        const filePath = path.join(targetPath, file.name);
        const fileStats = fs.statSync(filePath);
        const sizeStr = formatFileSize(fileStats.size);

        response += `  📄 ${file.name} (${sizeStr})\n`;
      }
    }

    if (dirs.length === 0 && files.length === 0) {
      response += '(empty directory)';
    }

    return response;

  } catch (error) {
    logger.error('ls command failed:', error);
    return `❌ Failed to list directory: ${error.message}`;
  }
}

/**
 * Read file content
 * @param {Object} context - Command context
 * @returns {Promise<string>} Response message
 */
export async function cat(context) {
  const { userId, args, sessionManager } = context;

  // Get active session
  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session. Use /newsession to create one.';
  }

  if (session.state !== 'PROJECT_SELECTED') {
    return '❌ No project selected. Use /project <name> first.';
  }

  // Parse file path argument
  if (args.length === 0) {
    return '❌ Missing file path.\n\n*Usage:* /cat <file>\n*Example:* /cat src/index.js';
  }

  const requestedPath = args.join(' ');

  // Validate path security
  const securityCheck = checkPathSecurity(requestedPath, session.projectPath);
  if (!securityCheck.safe) {
    return `❌ Security error: ${securityCheck.error}`;
  }

  const targetPath = securityCheck.resolvedPath;

  try {
    // Read file with smart truncation
    const result = readFileSmart(targetPath);

    if (!result.success) {
      return `❌ ${result.error}: ${requestedPath}`;
    }

    // Detect file language for syntax highlighting
    const ext = path.extname(targetPath).substring(1);
    const language = detectLanguage(ext);

    // Format for WhatsApp
    let response = `📄 *File: ${requestedPath}*\n`;
    response += `Size: ${formatFileSize(result.size)}\n\n`;

    if (result.truncated) {
      response += `⚠️ File truncated (showing first ${formatFileSize(result.truncatedAt)})\n\n`;
    }

    // Format content
    const formattedContent = formatForWhatsApp(result.content, {
      codeBlock: true,
      language,
      maxLength: 3500 // Leave room for header
    });

    response += formattedContent;

    return response;

  } catch (error) {
    logger.error('cat command failed:', error);
    return `❌ Failed to read file: ${error.message}`;
  }
}

/**
 * Show directory tree
 * @param {Object} context - Command context
 * @returns {Promise<string>} Response message
 */
export async function tree(context) {
  const { userId, args, flags = {}, sessionManager } = context;

  // Get active session
  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session. Use /newsession to create one.';
  }

  if (session.state !== 'PROJECT_SELECTED') {
    return '❌ No project selected. Use /project <name> first.';
  }

  // Parse path argument (default: current directory)
  const requestedPath = args.length > 0 ? args.join(' ') : '.';

  // Parse depth flag
  let maxDepth = parseInt(process.env.FILE_OPS_TREE_MAX_DEPTH) || 5;
  if (flags.depth) {
    const parsedDepth = parseInt(flags.depth);
    if (!isNaN(parsedDepth) && parsedDepth > 0 && parsedDepth <= 10) {
      maxDepth = parsedDepth;
    }
  }

  // Validate path security
  const securityCheck = checkPathSecurity(requestedPath, session.projectPath);
  if (!securityCheck.safe) {
    return `❌ Security error: ${securityCheck.error}`;
  }

  const targetPath = securityCheck.resolvedPath;

  try {
    // Generate tree
    const result = generateTree(targetPath, maxDepth);

    if (!result.success) {
      return `❌ ${result.error}: ${requestedPath}`;
    }

    let response = `🌲 *Directory Tree: ${requestedPath === '.' ? '/' : requestedPath}*\n\n`;
    response += `${result.dirCount} directories, ${result.fileCount} files\n`;
    response += `Max depth: ${maxDepth}\n\n`;

    // Format tree for WhatsApp
    const formattedTree = formatForWhatsApp(result.tree, {
      codeBlock: false,
      maxLength: 3500
    });

    response += formattedTree;

    // Add hint if truncated
    if (formattedTree.includes('(truncated')) {
      response += `\n\n💡 Use \`/tree --depth=${Math.max(1, maxDepth - 1)}\` for less detail`;
    }

    return response;

  } catch (error) {
    logger.error('tree command failed:', error);
    return `❌ Failed to generate tree: ${error.message}`;
  }
}

/**
 * Search in files (grep-like)
 * @param {Object} context - Command context
 * @returns {Promise<string>} Response message
 */
export async function search(context) {
  const { userId, args, flags = {}, sessionManager } = context;

  // Get active session
  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session. Use /newsession to create one.';
  }

  if (session.state !== 'PROJECT_SELECTED') {
    return '❌ No project selected. Use /project <name> first.';
  }

  // Parse pattern argument
  if (args.length === 0) {
    return '❌ Missing search pattern.\n\n' +
           '*Usage:* /search <pattern> [path]\n' +
           '*Examples:*\n' +
           '  /search "function" src/\n' +
           '  /search --file="*.js" "import"';
  }

  const pattern = args[0];
  const searchPath = args.length > 1 ? args.slice(1).join(' ') : '.';

  // Parse options
  const ignoreCase = flags.i !== false; // Default: case-insensitive
  const filePattern = flags.file || null;
  const maxResults = Math.min(
    parseInt(flags.limit) || 50,
    parseInt(process.env.FILE_OPS_SEARCH_MAX_RESULTS) || 50
  );

  // Validate path security
  const securityCheck = checkPathSecurity(searchPath, session.projectPath);
  if (!securityCheck.safe) {
    return `❌ Security error: ${securityCheck.error}`;
  }

  const targetPath = securityCheck.resolvedPath;

  try {
    // Search files
    const result = searchInFiles(targetPath, pattern, {
      maxResults,
      ignoreCase,
      filePattern
    });

    if (!result.success) {
      return `❌ ${result.error}`;
    }

    if (result.totalMatches === 0) {
      return `🔍 *Search Results*\n\n` +
             `Pattern: "${pattern}"\n` +
             `Path: ${searchPath}\n\n` +
             `No matches found.`;
    }

    let response = `🔍 *Search Results*\n\n`;
    response += `Pattern: "${pattern}"\n`;
    response += `Path: ${searchPath}\n`;
    if (filePattern) {
      response += `Files: ${filePattern}\n`;
    }
    response += `Found: ${result.totalMatches} matches\n\n`;

    // Group results by file
    const resultsByFile = {};
    for (const match of result.results) {
      if (!resultsByFile[match.file]) {
        resultsByFile[match.file] = [];
      }
      resultsByFile[match.file].push(match);
    }

    // Format results
    for (const [file, matches] of Object.entries(resultsByFile)) {
      response += `📄 *${file}*\n`;

      for (const match of matches) {
        response += `  Line ${match.line}: ${match.content.substring(0, 80)}\n`;
      }

      response += '\n';
    }

    if (result.truncated) {
      response += `⚠️ Results truncated at ${maxResults} matches\n`;
      response += `Use \`--limit=N\` for more results (max ${process.env.FILE_OPS_SEARCH_MAX_RESULTS || 50})`;
    }

    // Truncate response if too long
    if (response.length > 3800) {
      response = response.substring(0, 3800) + '\n\n... (truncated)';
    }

    return response;

  } catch (error) {
    logger.error('search command failed:', error);
    return `❌ Failed to search: ${error.message}`;
  }
}

/**
 * Show git diff
 * @param {Object} context - Command context
 * @returns {Promise<string>} Response message
 */
export async function diff(context) {
  const { userId, args, sessionManager } = context;

  // Get active session
  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session. Use /newsession to create one.';
  }

  if (session.state !== 'PROJECT_SELECTED') {
    return '❌ No project selected. Use /project <name> first.';
  }

  // Parse path argument (default: all changes)
  const requestedPath = args.length > 0 ? args.join(' ') : '.';

  // Validate path security
  const securityCheck = checkPathSecurity(requestedPath, session.projectPath);
  if (!securityCheck.safe) {
    return `❌ Security error: ${securityCheck.error}`;
  }

  const targetPath = securityCheck.resolvedPath;

  try {
    // Get git diff
    const result = getGitDiff(targetPath, session.projectPath);

    if (!result.success) {
      return `❌ ${result.error}`;
    }

    let response = `📊 *Git Diff: ${requestedPath === '.' ? 'All Changes' : requestedPath}*\n\n`;

    if (!result.hasChanges) {
      response += '✅ No changes detected\n\n';
      response += 'Working directory is clean.';
      return response;
    }

    // Format diff for WhatsApp
    const formattedDiff = formatForWhatsApp(result.diff, {
      codeBlock: true,
      language: 'diff',
      maxLength: 3500
    });

    response += formattedDiff;

    return response;

  } catch (error) {
    logger.error('diff command failed:', error);
    return `❌ Failed to get diff: ${error.message}`;
  }
}

/**
 * Format file size to human-readable string
 * @param {number} bytes
 * @returns {string}
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Detect programming language from file extension
 * @param {string} ext - File extension
 * @returns {string} Language identifier for syntax highlighting
 */
function detectLanguage(ext) {
  const languageMap = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rb: 'ruby',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    go: 'go',
    rs: 'rust',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    html: 'html',
    css: 'css',
    scss: 'scss',
    json: 'json',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sh: 'bash',
    bash: 'bash',
    sql: 'sql',
    dockerfile: 'dockerfile'
  };

  return languageMap[ext.toLowerCase()] || '';
}

export default {
  ls,
  cat,
  tree,
  search,
  diff
};
