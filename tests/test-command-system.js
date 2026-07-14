/**
 * Test Command System (Phase 1)
 *
 * Tests the new command system components:
 * - Command Parser
 * - Command Registry
 * - Command Handler
 * - Basic Commands (help, ping, version, status)
 */

import { CommandParser } from '../src/commands/parser.js';
import { getRegistry } from '../src/commands/registry.js';
import { CommandHandler } from '../src/commands/handler.js';
import { SessionDatabase } from '../src/database/session-db.js';
import { Logger } from '../src/utils/logger.js';

const logger = new Logger('CommandTest');

// Mock SessionManager for testing
class MockSessionManager {
  constructor() {
    this.db = new SessionDatabase({ path: ':memory:' });
    this.sessions = new Map();
  }

  getActiveSession(userId) {
    return this.sessions.get(userId) || null;
  }

  getUserSessions(userId) {
    const session = this.sessions.get(userId);
    return session ? [session] : [];
  }

  getTotalSessions() {
    return this.sessions.size;
  }

  getActiveSessions() {
    return Array.from(this.sessions.values());
  }

  createTestSession(userId) {
    const session = {
      sessionId: 'sess_test123',
      userId,
      state: 'PROJECT_SELECTED',
      projectPath: '/test/project',
      createdAt: Date.now(),
      lastActive: Date.now()
    };
    this.sessions.set(userId, session);
    return session;
  }
}

async function testCommandParser() {
  logger.info('Testing Command Parser...');

  // Test basic command
  const parsed1 = CommandParser.parse('/help');
  console.assert(parsed1.command === 'help', 'Parse /help failed');
  console.assert(parsed1.args.length === 0, 'Parse /help args failed');

  // Test command with args
  const parsed2 = CommandParser.parse('/session sess_abc123');
  console.assert(parsed2.command === 'session', 'Parse /session failed');
  console.assert(parsed2.args[0] === 'sess_abc123', 'Parse /session args failed');

  // Test command with flags
  const parsed3 = CommandParser.parse('/help status --verbose');
  console.assert(parsed3.command === 'help', 'Parse /help with flags failed');
  console.assert(parsed3.args[0] === 'status', 'Parse /help args with flags failed');
  console.assert(parsed3.flags.verbose === true, 'Parse flags failed');

  // Test non-command
  const parsed4 = CommandParser.parse('not a command');
  console.assert(parsed4 === null, 'Non-command should return null');

  logger.success('✅ Command Parser tests passed');
}

async function testCommandRegistry() {
  logger.info('Testing Command Registry...');

  const registry = getRegistry();

  // Test registry initialized
  console.assert(registry.count() > 0, 'Registry should have commands');

  // Test get command
  const helpCmd = registry.get('help');
  console.assert(helpCmd !== null, 'Should find help command');
  console.assert(helpCmd.name === 'help', 'Help command name check');

  // Test alias lookup
  const pingCmd = registry.get('heartbeat');
  console.assert(pingCmd !== null, 'Should find command by alias');
  console.assert(pingCmd.name === 'ping', 'Alias should resolve to ping');

  // Test categories
  const categories = registry.getCategories();
  console.assert(categories.length > 0, 'Should have categories');
  console.assert(categories.includes('general'), 'Should have general category');

  // Test get by category
  const generalCommands = registry.getByCategory('general');
  console.assert(generalCommands.length > 0, 'Should have commands in general category');

  logger.success('✅ Command Registry tests passed');
}

async function testBasicCommands() {
  logger.info('Testing Basic Commands...');

  const sessionManager = new MockSessionManager();
  const testUserId = '628123456789';

  // Create test session
  sessionManager.createTestSession(testUserId);

  const handler = new CommandHandler({
    sessionManager,
    db: sessionManager.db,
    projectRootPath: '/test/projects',
    allowedNumbers: new Set([testUserId])
  });

  // Test /help command
  logger.info('Testing /help...');
  const helpResponse = await handler.execute(testUserId, '/help');
  console.assert(helpResponse.success, '/help should succeed');
  console.assert(helpResponse.message.includes('Available Commands'), '/help should show commands');
  logger.success('✅ /help works');

  // Test /ping command
  logger.info('Testing /ping...');
  const pingResponse = await handler.execute(testUserId, '/ping');
  console.assert(pingResponse.success, '/ping should succeed');
  console.assert(pingResponse.message.includes('Pong'), '/ping should return pong');
  logger.success('✅ /ping works');

  // Test /version command
  logger.info('Testing /version...');
  const versionResponse = await handler.execute(testUserId, '/version');
  console.assert(versionResponse.success, '/version should succeed');
  console.assert(versionResponse.message.includes('Version'), '/version should show version info');
  logger.success('✅ /version works');

  // Test /status command
  logger.info('Testing /status...');
  const statusResponse = await handler.execute(testUserId, '/status');
  console.assert(statusResponse.success, '/status should succeed');
  console.assert(statusResponse.message.includes('Status'), '/status should show status');
  logger.success('✅ /status works');

  // Test unknown command
  logger.info('Testing unknown command...');
  const unknownResponse = await handler.execute(testUserId, '/unknown');
  console.assert(!unknownResponse.success, 'Unknown command should fail');
  console.assert(unknownResponse.message.includes('Unknown command'), 'Should show unknown command error');
  logger.success('✅ Unknown command handling works');

  logger.success('✅ All basic command tests passed');
}

async function testRateLimiting() {
  logger.info('Testing Rate Limiting...');

  const sessionManager = new MockSessionManager();
  const testUserId = '628123456789';

  const handler = new CommandHandler({
    sessionManager,
    db: sessionManager.db,
    projectRootPath: '/test/projects',
    allowedNumbers: new Set([testUserId])
  });

  // Ping has rate limit of 30 calls per 60 seconds
  // Execute 31 times rapidly
  let rateLimitHit = false;

  for (let i = 0; i < 31; i++) {
    const response = await handler.execute(testUserId, '/ping');
    if (!response.success && response.message.includes('Rate Limit')) {
      rateLimitHit = true;
      break;
    }
  }

  console.assert(rateLimitHit, 'Rate limit should be enforced');
  logger.success('✅ Rate limiting works');
}

async function testCommandHistory() {
  logger.info('Testing Command History...');

  const sessionManager = new MockSessionManager();
  const testUserId = '628123456789';

  const handler = new CommandHandler({
    sessionManager,
    db: sessionManager.db,
    projectRootPath: '/test/projects',
    allowedNumbers: new Set([testUserId])
  });

  // Execute some commands
  await handler.execute(testUserId, '/help');
  await handler.execute(testUserId, '/ping');
  await handler.execute(testUserId, '/version');

  // Check command history in database
  const history = sessionManager.db.getCommandHistory(testUserId);
  console.assert(history.length >= 3, 'Should have command history');
  logger.success('✅ Command history logging works');
}

async function testWhitelistAuth() {
  logger.info('Testing Whitelist Authentication...');

  const sessionManager = new MockSessionManager();
  const allowedUserId = '628123456789';
  const blockedUserId = '628999999999';

  const handler = new CommandHandler({
    sessionManager,
    db: sessionManager.db,
    projectRootPath: '/test/projects',
    allowedNumbers: new Set([allowedUserId]) // Only allow one user
  });

  // Test allowed user
  const allowedResponse = await handler.execute(allowedUserId, '/help');
  console.assert(allowedResponse.success, 'Allowed user should succeed');

  // Test blocked user
  const blockedResponse = await handler.execute(blockedUserId, '/help');
  console.assert(!blockedResponse.success, 'Blocked user should fail');
  console.assert(blockedResponse.message === null, 'Blocked user should get silent drop');

  logger.success('✅ Whitelist authentication works');
}

// Run all tests
async function runAllTests() {
  logger.info('=== Starting Command System Tests ===\n');

  try {
    await testCommandParser();
    await testCommandRegistry();
    await testBasicCommands();
    await testRateLimiting();
    await testCommandHistory();
    await testWhitelistAuth();

    logger.success('\n=== All Tests Passed ✅ ===');
    process.exit(0);
  } catch (error) {
    logger.error('\n=== Tests Failed ❌ ===');
    logger.error(error.message);
    logger.error(error.stack);
    process.exit(1);
  }
}

runAllTests();
