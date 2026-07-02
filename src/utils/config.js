/**
 * CodeBridge Configuration
 *
 * Centralized configuration for API keys, endpoints, and settings
 */

export const config = {
  // Claude API Configuration
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY || 'kv-27bc3e239790219561fefcc4d66e1912cd879e1035e4d54d',
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
    defaultCwd: process.cwd(),
  },

  // Debug Mode
  debug: process.env.DEBUG === 'true',
};

export default config;
