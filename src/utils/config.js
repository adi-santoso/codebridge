/**
 * CodeBridge Configuration
 *
 * Centralized configuration for API keys, endpoints, and settings
 */

export const config = {
  // Anthropic/Claude Configuration
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || 'kv-10f188b357d5f639fced98fe4c6934f8dc561c25c7d98be9',
    customEndpoint: process.env.ANTHROPIC_BASE_URL || 'http://127.0.0.1:3847/',
    model: process.env.CLAUDE_MODEL || 'kiro-claude-sonnet-4.5',
  },

  // Legacy aliases (backward compatibility)
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY || 'kv-10f188b357d5f639fced98fe4c6934f8dc561c25c7d98be9',
    baseUrl: process.env.ANTHROPIC_BASE_URL || 'http://127.0.0.1:3847/',
    model: process.env.CLAUDE_MODEL || 'kiro-claude-sonnet-4.5',
  },

  // Session Configuration
  session: {
    defaultMode: 'bypassPermissions',  // Auto-bypass permissions
    timeout: 300000,  // 5 minutes - custom endpoint might be slow
    maxRetries: 3,
  },

  // Project Configuration
  project: {
    defaultPath: process.env.PROJECT_PATH || process.cwd(),
    defaultCwd: process.cwd(), // Legacy alias
  },

  // Debug Mode
  debug: process.env.DEBUG === 'true',
};

export default config;
