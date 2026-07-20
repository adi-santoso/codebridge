/**
 * File Operations Utilities (Phase 4)
 *
 * Helper utilities for safe file operations:
 * - Path validation and security
 * - Smart file reading with size limits
 * - Directory tree generation
 * - File search (grep-like)
 * - Git diff wrapper
 * - WhatsApp formatting
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Logger } from './logger.js';

const logger = new Logger('FileOps');

// Configuration (overridable via env)
const MAX_FILE_SIZE = parseInt(process.env.FILE_OPS_MAX_SIZE) || 1048576; // 1MB
const TREE_MAX_DEPTH = parseInt(process.env.FILE_OPS_TREE_MAX_DEPTH) || 5;
const SEARCH_MAX_RESULTS = parseInt(process.env.FILE_OPS_SEARCH_MAX_RESULTS) || 50;
const WHATSAPP_MAX_LENGTH = parseInt(process.env.FILE_OPS_WHATSAPP_MAX_LENGTH) || 4000;

/**
 * Check if a path is safe to access (prevent directory traversal)
 * @param {string} requestedPath - Path requested by user
 * @param {string} projectRoot - Project root directory
 * @returns {Object} { safe: boolean, error?: string, resolvedPath?: string }
 */
export function checkPathSecurity(requestedPath, projectRoot) {
  try {
    // Resolve both paths to absolute
    const absoluteProjectRoot = path.resolve(projectRoot);
    const absoluteRequested = path.resolve(projectRoot, requestedPath);

    // Check if requested path is within project root
    if (!absoluteRequested.startsWith(absoluteProjectRoot)) {
      return {
        safe: false,
        error: 'Path outside project directory (security violation)'
      };
    }

    return {
      safe: true,
      resolvedPath: absoluteRequested
    };
  } catch (error) {
    return {
      safe: false,
      error: `Path validation failed: ${error.message}`
    };
  }
}

/**
 * Read file with smart truncation if too large
 * @param {string} filePath - Absolute file path
 * @param {number} maxSize - Max file size in bytes
 * @returns {Object} { success: boolean, content?: string, truncated?: boolean, size?: number, error?: string }
 */
export function readFileSmart(filePath, maxSize = MAX_FILE_SIZE) {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        error: 'File not found'
      };
    }

    // Check if it's a file (not directory)
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return {
        success: false,
        error: 'Not a file (use /ls for directories)'
      };
    }

    const fileSize = stats.size;

    // Check file size
    if (fileSize === 0) {
      return {
        success: true,
        content: '',
        truncated: false,
        size: 0
      };
    }

    if (fileSize > maxSize) {
      // Read only first portion
      const buffer = Buffer.alloc(maxSize);
      const fd = fs.openSync(filePath, 'r');
      const bytesRead = fs.readSync(fd, buffer, 0, maxSize, 0);
      fs.closeSync(fd);

      const content = buffer.toString('utf8', 0, bytesRead);

      return {
        success: true,
        content,
        truncated: true,
        size: fileSize,
        truncatedAt: maxSize
      };
    }

    // Read full file
    const content = fs.readFileSync(filePath, 'utf8');

    return {
      success: true,
      content,
      truncated: false,
      size: fileSize
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate directory tree structure
 * @param {string} dirPath - Absolute directory path
 * @param {number} maxDepth - Maximum depth to traverse
 * @param {number} currentDepth - Current depth (internal)
 * @param {string} prefix - Prefix for tree formatting (internal)
 * @returns {Object} { success: boolean, tree?: string, fileCount?: number, dirCount?: number, error?: string }
 */
export function generateTree(dirPath, maxDepth = TREE_MAX_DEPTH, currentDepth = 0, prefix = '') {
  try {
    // Check if directory exists
    if (!fs.existsSync(dirPath)) {
      return {
        success: false,
        error: 'Directory not found'
      };
    }

    // Check if it's a directory
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return {
        success: false,
        error: 'Not a directory (use /cat for files)'
      };
    }

    let tree = '';
    let fileCount = 0;
    let dirCount = 0;

    // Read directory contents
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    // Sort: directories first, then files
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const isLast = i === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const newPrefix = prefix + (isLast ? '    ' : '│   ');

      // Skip hidden files/directories (starting with .)
      if (entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory()) {
        dirCount++;
        tree += `${prefix}${connector}📁 ${entry.name}/\n`;

        // Recurse if not at max depth
        if (currentDepth < maxDepth) {
          const subPath = path.join(dirPath, entry.name);
          const subResult = generateTree(subPath, maxDepth, currentDepth + 1, newPrefix);

          if (subResult.success) {
            tree += subResult.tree;
            fileCount += subResult.fileCount;
            dirCount += subResult.dirCount;
          }
        } else {
          tree += `${newPrefix}...\n`;
        }
      } else {
        fileCount++;
        const filePath = path.join(dirPath, entry.name);
        const fileStats = fs.statSync(filePath);
        const sizeStr = formatFileSize(fileStats.size);

        tree += `${prefix}${connector}📄 ${entry.name} (${sizeStr})\n`;
      }
    }

    return {
      success: true,
      tree,
      fileCount,
      dirCount
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Search for pattern in files (grep-like)
 * @param {string} searchPath - Directory to search in
 * @param {string} pattern - Search pattern (string or regex)
 * @param {Object} options - Search options
 * @returns {Object} { success: boolean, results?: Array, totalMatches?: number, error?: string }
 */
export function searchInFiles(searchPath, pattern, options = {}) {
  const {
    maxResults = SEARCH_MAX_RESULTS,
    ignoreCase = true,
    filePattern = null // e.g., '*.js'
  } = options;

  try {
    // Check if directory exists
    if (!fs.existsSync(searchPath)) {
      return {
        success: false,
        error: 'Directory not found'
      };
    }

    const results = [];
    let totalMatches = 0;

    // Create regex from pattern
    const flags = ignoreCase ? 'gi' : 'g';
    const regex = new RegExp(pattern, flags);

    /**
     * Search recursively
     */
    function searchDir(dirPath) {
      if (totalMatches >= maxResults) {
        return; // Stop searching
      }

      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (totalMatches >= maxResults) {
          break;
        }

        // Skip hidden files/directories
        if (entry.name.startsWith('.')) {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          searchDir(fullPath); // Recurse
        } else if (entry.isFile()) {
          // Check file pattern filter
          if (filePattern && !matchFilePattern(entry.name, filePattern)) {
            continue;
          }

          // Search file
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
              if (totalMatches >= maxResults) {
                break;
              }

              const line = lines[i];
              if (regex.test(line)) {
                totalMatches++;

                const relativePath = path.relative(searchPath, fullPath);

                results.push({
                  file: relativePath,
                  line: i + 1,
                  content: line.trim(),
                  match: pattern
                });
              }

              // Reset regex state
              regex.lastIndex = 0;
            }
          } catch (err) {
            // Skip files that can't be read (binary, etc.)
            logger.debug(`Skipping file ${fullPath}: ${err.message}`);
          }
        }
      }
    }

    searchDir(searchPath);

    return {
      success: true,
      results,
      totalMatches,
      truncated: totalMatches >= maxResults
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get git diff for file or directory
 * @param {string} targetPath - File or directory path (absolute)
 * @param {string} projectRoot - Project root directory
 * @returns {Object} { success: boolean, diff?: string, hasChanges?: boolean, error?: string }
 */
export function getGitDiff(targetPath, projectRoot) {
  try {
    // Check if git is available
    try {
      execSync('git --version', { stdio: 'ignore' });
    } catch (err) {
      return {
        success: false,
        error: 'Git not available'
      };
    }

    // Check if it's a git repository
    try {
      execSync('git rev-parse --git-dir', {
        cwd: projectRoot,
        stdio: 'ignore'
      });
    } catch (err) {
      return {
        success: false,
        error: 'Not a git repository'
      };
    }

    // Get relative path for git
    const relativePath = path.relative(projectRoot, targetPath);

    // Run git diff
    let diff = '';
    try {
      diff = execSync(`git diff HEAD -- "${relativePath}"`, {
        cwd: projectRoot,
        encoding: 'utf8',
        maxBuffer: MAX_FILE_SIZE
      });
    } catch (err) {
      // git diff returns non-zero exit code if there are no changes
      // Check if it's actually an error
      if (err.stdout) {
        diff = err.stdout;
      } else {
        return {
          success: false,
          error: `Git diff failed: ${err.message}`
        };
      }
    }

    const hasChanges = diff.trim().length > 0;

    return {
      success: true,
      diff: diff || '(no changes)',
      hasChanges
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Format output for WhatsApp (truncate if too long, add code blocks)
 * @param {string} content - Content to format
 * @param {Object} options - Formatting options
 * @returns {string} Formatted content
 */
export function formatForWhatsApp(content, options = {}) {
  const {
    maxLength = WHATSAPP_MAX_LENGTH,
    codeBlock = true,
    language = '',
    truncateMessage = '\n\n... (truncated, file too large)'
  } = options;

  let formatted = content;

  // Truncate if too long
  if (formatted.length > maxLength) {
    const availableLength = maxLength - truncateMessage.length;
    formatted = formatted.substring(0, availableLength) + truncateMessage;
  }

  // Wrap in code block
  if (codeBlock) {
    formatted = `\`\`\`${language}\n${formatted}\n\`\`\``;
  }

  return formatted;
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
 * Match file name against pattern (simple wildcard matching)
 * @param {string} fileName
 * @param {string} pattern - e.g., '*.js', 'test*.js'
 * @returns {boolean}
 */
function matchFilePattern(fileName, pattern) {
  // Convert wildcard pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(fileName);
}

export default {
  checkPathSecurity,
  readFileSmart,
  generateTree,
  searchInFiles,
  getGitDiff,
  formatForWhatsApp
};
