/**
 * Tool Registry (Phase 3)
 *
 * Central registry of all available tools with metadata
 * Provides tool information for /tools command and permission checking
 */

export const TOOL_CATEGORIES = {
  FILE: 'file',
  SEARCH: 'search',
  EXECUTION: 'execution',
  NETWORK: 'network',
  ANALYSIS: 'analysis',
  SYSTEM: 'system',
  VCS: 'vcs',
  DATABASE: 'database'
};

/**
 * Tool Registry
 * Maps tool names to their metadata
 *
 * Note: This is a best-effort registry based on known Claude CLI tools.
 * DirectClaudeSpawner doesn't expose available tools dynamically.
 */
export const TOOL_REGISTRY = {
  // File operations
  'Read': {
    name: 'Read',
    category: TOOL_CATEGORIES.FILE,
    description: 'Read file contents',
    cancellable: false,
    critical: false
  },
  'Write': {
    name: 'Write',
    category: TOOL_CATEGORIES.FILE,
    description: 'Write to file',
    cancellable: true,
    critical: false
  },
  'Edit': {
    name: 'Edit',
    category: TOOL_CATEGORIES.FILE,
    description: 'Edit file (replace text)',
    cancellable: true,
    critical: false
  },
  'Glob': {
    name: 'Glob',
    category: TOOL_CATEGORIES.FILE,
    description: 'Find files by pattern',
    cancellable: false,
    critical: false
  },

  // Search operations
  'Grep': {
    name: 'Grep',
    category: TOOL_CATEGORIES.SEARCH,
    description: 'Search file contents',
    cancellable: true,
    critical: false
  },

  // Execution
  'Bash': {
    name: 'Bash',
    category: TOOL_CATEGORIES.EXECUTION,
    description: 'Execute shell command',
    cancellable: true,
    critical: false
  },

  // Network
  'WebFetch': {
    name: 'WebFetch',
    category: TOOL_CATEGORIES.NETWORK,
    description: 'Fetch web content',
    cancellable: true,
    critical: false
  },
  'WebSearch': {
    name: 'WebSearch',
    category: TOOL_CATEGORIES.NETWORK,
    description: 'Search the web',
    cancellable: true,
    critical: false
  },

  // Analysis
  'Agent': {
    name: 'Agent',
    category: TOOL_CATEGORIES.ANALYSIS,
    description: 'Spawn sub-agent for task',
    cancellable: true,
    critical: false
  },

  // VCS (Git)
  'git': {
    name: 'git',
    category: TOOL_CATEGORIES.VCS,
    description: 'Git operations (via Bash)',
    cancellable: true,
    critical: false
  },

  // System commands (via Bash)
  'ls': {
    name: 'ls',
    category: TOOL_CATEGORIES.SYSTEM,
    description: 'List directory contents',
    cancellable: false,
    critical: false
  },
  'find': {
    name: 'find',
    category: TOOL_CATEGORIES.SYSTEM,
    description: 'Find files',
    cancellable: true,
    critical: false
  },
  'cat': {
    name: 'cat',
    category: TOOL_CATEGORIES.SYSTEM,
    description: 'Display file contents',
    cancellable: false,
    critical: false
  }
};

/**
 * Get tool information by name
 * @param {string} toolName
 * @returns {Object|null}
 */
export function getToolInfo(toolName) {
  return TOOL_REGISTRY[toolName] || null;
}

/**
 * Get tools by category
 * @param {string} category
 * @returns {Array<Object>}
 */
export function getToolsByCategory(category) {
  return Object.values(TOOL_REGISTRY).filter(tool => tool.category === category);
}

/**
 * Get all registered tools
 * @returns {Array<Object>}
 */
export function getAllTools() {
  return Object.values(TOOL_REGISTRY);
}

/**
 * Check if tool is critical (cannot be disabled)
 * @param {string} toolName
 * @returns {boolean}
 */
export function isToolCritical(toolName) {
  const tool = getToolInfo(toolName);
  return tool ? tool.critical : false;
}

/**
 * Check if tool is cancellable
 * @param {string} toolName
 * @returns {boolean}
 */
export function isToolCancellable(toolName) {
  const tool = getToolInfo(toolName);
  return tool ? tool.cancellable : false;
}

/**
 * Search tools by name pattern
 * Supports wildcards: * and ?
 * @param {string} pattern
 * @returns {Array<Object>}
 */
export function searchTools(pattern) {
  // Convert wildcard pattern to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    .replace(/\*/g, '.*')                  // * → .*
    .replace(/\?/g, '.');                  // ? → .

  const regex = new RegExp(`^${regexPattern}$`, 'i');

  return Object.values(TOOL_REGISTRY).filter(tool =>
    regex.test(tool.name)
  );
}

/**
 * Get tool categories
 * @returns {Array<string>}
 */
export function getCategories() {
  return Object.values(TOOL_CATEGORIES);
}

/**
 * Get tools grouped by category
 * @returns {Object} Map of category → tools array
 */
export function getToolsByCategories() {
  const grouped = {};

  for (const category of Object.values(TOOL_CATEGORIES)) {
    grouped[category] = [];
  }

  for (const tool of Object.values(TOOL_REGISTRY)) {
    if (grouped[tool.category]) {
      grouped[tool.category].push(tool);
    }
  }

  return grouped;
}

export default {
  TOOL_CATEGORIES,
  TOOL_REGISTRY,
  getToolInfo,
  getToolsByCategory,
  getAllTools,
  isToolCritical,
  isToolCancellable,
  searchTools,
  getCategories,
  getToolsByCategories
};
