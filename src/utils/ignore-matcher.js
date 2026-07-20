/**
 * Ignore Pattern Matcher - Phase 7
 *
 * .gitignore-style pattern matching utility
 * Supports wildcards, directory patterns, negation, and comments
 *
 * Pattern Syntax:
 * - *.log          - Wildcard (matches any .log file)
 * - node_modules/  - Directory (matches directory and its contents)
 * - star-star/dist - Recursive (matches dist anywhere, use ** instead of star-star)
 * - !important.log - Negation (not ignored)
 * - #comment       - Comment (ignored)
 * - *              - Match all
 * - *.{js,ts}      - Brace expansion (not supported, must use multiple patterns)
 *
 * @module ignore-matcher
 */

import path from 'path';

/**
 * Check if a path matches any ignore pattern
 * @param {string} targetPath - Path to check (relative to project root)
 * @param {Array<string>} patterns - Array of ignore patterns
 * @returns {boolean} True if path should be ignored
 */
export function matchesPattern(targetPath, patterns) {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  // Normalize path separators to forward slashes
  const normalizedPath = targetPath.replace(/\\/g, '/');

  let shouldIgnore = false;

  for (const pattern of patterns) {
    const trimmed = pattern.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Skip comments
    if (trimmed.startsWith('#')) continue;

    // Check for negation pattern
    const isNegation = trimmed.startsWith('!');
    const actualPattern = isNegation ? trimmed.slice(1) : trimmed;

    // Check if path matches this pattern
    const matches = matchSinglePattern(normalizedPath, actualPattern);

    if (matches) {
      if (isNegation) {
        // Negation: explicitly NOT ignored
        shouldIgnore = false;
      } else {
        // Normal pattern: mark as ignored
        shouldIgnore = true;
      }
    }
  }

  return shouldIgnore;
}

/**
 * Check if a path matches a single pattern
 * @param {string} targetPath - Normalized path (with forward slashes)
 * @param {string} pattern - Single ignore pattern
 * @returns {boolean} True if matches
 * @private
 */
function matchSinglePattern(targetPath, pattern) {
  // Normalize pattern separators
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // Directory pattern (ends with /)
  const isDirectoryPattern = normalizedPattern.endsWith('/');
  const patternWithoutSlash = isDirectoryPattern
    ? normalizedPattern.slice(0, -1)
    : normalizedPattern;

  // Recursive pattern (**/something)
  if (normalizedPattern.includes('**/')) {
    return matchRecursivePattern(targetPath, normalizedPattern);
  }

  // Wildcard pattern (*.log, *.js, etc)
  if (normalizedPattern.includes('*')) {
    return matchWildcardPattern(targetPath, normalizedPattern, isDirectoryPattern);
  }

  // Exact match or directory match
  if (isDirectoryPattern) {
    // Match directory and all its contents
    return targetPath === patternWithoutSlash ||
           targetPath.startsWith(patternWithoutSlash + '/');
  } else {
    // Exact match
    return targetPath === normalizedPattern ||
           targetPath.startsWith(normalizedPattern + '/') ||
           targetPath.endsWith('/' + normalizedPattern);
  }
}

/**
 * Match recursive pattern (star-star/something)
 * @param {string} targetPath - Target path
 * @param {string} pattern - Pattern with star-star
 * @returns {boolean} True if matches
 * @private
 */
function matchRecursivePattern(targetPath, pattern) {
  // Convert star-star/something to regex that matches "something" anywhere
  // Examples:
  //   star-star/dist -> matches "dist", "build/dist", "src/build/dist"
  //   star-star/node_modules -> matches "node_modules" anywhere

  const parts = pattern.split('**/');

  if (parts.length !== 2) {
    // Invalid pattern (multiple star-star/)
    return false;
  }

  const [prefix, suffix] = parts;
  const suffixWithoutTrailingSlash = suffix.replace(/\/$/, '');

  // Build regex
  // If prefix exists, path must start with it
  // Then match suffix anywhere after that
  let regex;
  if (prefix) {
    regex = new RegExp(`^${escapeRegex(prefix)}.*${escapeRegex(suffixWithoutTrailingSlash)}(/|$)`);
  } else {
    regex = new RegExp(`(^|/)${escapeRegex(suffixWithoutTrailingSlash)}(/|$)`);
  }

  return regex.test(targetPath);
}

/**
 * Match wildcard pattern (*.log, temp*, etc)
 * @param {string} targetPath - Target path
 * @param {string} pattern - Pattern with *
 * @param {boolean} isDirectoryPattern - Whether pattern ends with /
 * @returns {boolean} True if matches
 * @private
 */
function matchWildcardPattern(targetPath, pattern, isDirectoryPattern) {
  // Convert wildcard pattern to regex
  // * matches any characters except /
  // Examples:
  //   *.log -> matches "error.log" but not "logs/error.log"
  //   temp* -> matches "temp.txt", "temp-file.js"
  //   logs/*.log -> matches "logs/error.log" but not "logs/sub/error.log"

  const patternWithoutSlash = isDirectoryPattern
    ? pattern.slice(0, -1)
    : pattern;

  // Convert wildcard to regex
  const regexPattern = patternWithoutSlash
    .split('*')
    .map(escapeRegex)
    .join('[^/]*'); // * matches anything except /

  const regex = new RegExp(`(^|/)${regexPattern}(/|$)`);
  return regex.test(targetPath);
}

/**
 * Escape special regex characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 * @private
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Helper: Format bytes to human-readable size
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default {
  matchesPattern,
  formatBytes
};
