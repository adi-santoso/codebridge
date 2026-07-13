/**
 * Jest Configuration for CodeBridge
 * Uses ES Modules (type: "module" in package.json)
 */

export default {
  // Use node test environment
  testEnvironment: 'node',

  // Transform settings for ES modules
  transform: {},

  // Test file patterns
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/integration/**/*.test.js',
    '**/tests/e2e/**/*.test.js'
  ],

  // Coverage settings
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/server.js',
    '!**/node_modules/**'
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 80,
      statements: 80
    }
  },

  // Module paths
  moduleDirectories: ['node_modules', 'src'],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Verbose output
  verbose: true,

  // Timeout for tests
  testTimeout: 10000
};
