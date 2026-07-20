/**
 * Test Suite for Tool Commands (Phase 3)
 *
 * Tests tool control commands:
 * - /cancel
 * - /retry
 * - /tools
 * - /allow
 * - /deny
 * - /toollog
 */

import { SessionDatabase } from '../src/database/session-db.js';
import {
  getAllTools,
  getToolInfo,
  searchTools,
  getToolsByCategory,
  TOOL_CATEGORIES
} from '../src/commands/tool-registry.js';
import { Logger } from '../src/utils/logger.js';

const logger = new Logger('ToolCommandsTest');

// Test database
let testDb;

function setupTestDb() {
  logger.info('Setting up test database...');
  testDb = new SessionDatabase({ path: ':memory:' });
  return testDb;
}

function cleanupTestDb() {
  if (testDb) {
    testDb.close();
  }
}

// Test 1: Tool Registry
function testToolRegistry() {
  logger.info('\n=== Test 1: Tool Registry ===');

  // Test getting all tools
  const allTools = getAllTools();
  logger.info(`Total tools registered: ${allTools.length}`);
  assert(allTools.length > 0, 'Should have tools registered');

  // Test getting tool info
  const readTool = getToolInfo('Read');
  assert(readTool !== null, 'Should find Read tool');
  assert(readTool.name === 'Read', 'Tool name should match');
  assert(readTool.category === TOOL_CATEGORIES.FILE, 'Read should be in FILE category');

  // Test search with wildcard
  const webTools = searchTools('Web*');
  logger.info(`Found ${webTools.length} tools matching 'Web*'`);
  assert(webTools.length >= 2, 'Should find WebFetch and WebSearch');

  // Test category filtering
  const fileTools = getToolsByCategory(TOOL_CATEGORIES.FILE);
  logger.info(`Found ${fileTools.length} file tools`);
  assert(fileTools.length > 0, 'Should have file tools');

  logger.info('✅ Tool Registry tests passed');
}

// Test 2: Tool Audit Logging
function testToolAuditLog() {
  logger.info('\n=== Test 2: Tool Audit Logging ===');

  const db = setupTestDb();
  const userId = 'test_user';
  const sessionId = 'sess_test123';

  // Log some tool executions
  logger.info('Logging tool executions...');

  db.logToolExecution(
    userId,
    sessionId,
    'Read',
    { file: 'test.js' },
    { content: 'console.log("test");' },
    'success',
    150
  );

  db.logToolExecution(
    userId,
    sessionId,
    'Bash',
    { command: 'ls -la' },
    null,
    'error',
    50,
    'Command failed'
  );

  db.logToolExecution(
    userId,
    sessionId,
    'Write',
    { file: 'output.txt' },
    null,
    'cancelled',
    100,
    null,
    userId
  );

  // Get audit log
  const log = db.getToolAuditLog(userId, 10, 0);
  logger.info(`Retrieved ${log.length} log entries`);
  assert(log.length === 3, 'Should have 3 log entries');

  // Get count
  const count = db.getToolAuditCount(userId);
  assert(count === 3, 'Should have count of 3');

  // Get stats
  const stats = db.getToolStats(userId);
  logger.info(`Tool stats: ${stats.length} unique tools used`);
  assert(stats.length === 3, 'Should have stats for 3 tools');

  // Test filtering
  const errorLog = db.getToolAuditLog(userId, 10, 0, { status: 'error' });
  assert(errorLog.length === 1, 'Should have 1 error entry');
  assert(errorLog[0].toolName === 'Bash', 'Error entry should be Bash');

  // Test last execution
  const lastExecution = db.getLastToolExecution(userId);
  assert(lastExecution !== null, 'Should find last execution');
  assert(lastExecution.toolName === 'Write', 'Last execution should be Write');

  cleanupTestDb();
  logger.info('✅ Tool Audit Log tests passed');
}

// Test 3: Tool Permissions
function testToolPermissions() {
  logger.info('\n=== Test 3: Tool Permissions ===');

  const db = setupTestDb();
  const userId = 'test_user';

  // Set permissions
  logger.info('Setting tool permissions...');

  db.setToolPermission(userId, 'Bash', 'deny');
  db.setToolPermission(userId, 'Read', 'allow');
  db.setToolPermission(userId, 'Write', 'allow');

  // Get permissions
  const permissions = db.getToolPermissions(userId);
  logger.info(`Retrieved ${permissions.length} permissions`);
  assert(permissions.length === 3, 'Should have 3 permissions');

  // Check specific tool
  const bashAllowed = db.isToolAllowed(userId, 'Bash');
  assert(bashAllowed === false, 'Bash should be denied');

  const readAllowed = db.isToolAllowed(userId, 'Read');
  assert(readAllowed === true, 'Read should be allowed');

  const grepAllowed = db.isToolAllowed(userId, 'Grep');
  assert(grepAllowed === null, 'Grep should have no explicit permission');

  // Remove permission
  const removed = db.removeToolPermission(userId, 'Bash');
  assert(removed === true, 'Should remove Bash permission');

  const bashAfterRemove = db.isToolAllowed(userId, 'Bash');
  assert(bashAfterRemove === null, 'Bash should have no permission after removal');

  // Update permission
  db.setToolPermission(userId, 'Read', 'deny');
  const readAfterUpdate = db.isToolAllowed(userId, 'Read');
  assert(readAfterUpdate === false, 'Read should be denied after update');

  cleanupTestDb();
  logger.info('✅ Tool Permissions tests passed');
}

// Test 4: Tool Audit Cleanup
function testToolAuditCleanup() {
  logger.info('\n=== Test 4: Tool Audit Cleanup ===');

  const db = setupTestDb();
  const userId = 'test_user';
  const sessionId = 'sess_test123';

  // Set low max entries
  process.env.TOOL_AUDIT_MAX_ENTRIES = '5';

  // Log 10 tool executions
  logger.info('Logging 10 tool executions...');
  for (let i = 0; i < 10; i++) {
    db.logToolExecution(
      userId,
      sessionId,
      'Read',
      { file: `test${i}.js` },
      null,
      'success',
      100
    );
  }

  // Check count (cleanup should have triggered)
  const count = db.getToolAuditCount(userId);
  logger.info(`Count after cleanup: ${count}`);
  assert(count <= 5, 'Should have at most 5 entries after cleanup');

  // Reset env
  delete process.env.TOOL_AUDIT_MAX_ENTRIES;

  cleanupTestDb();
  logger.info('✅ Tool Audit Cleanup tests passed');
}

// Test 5: Tool Search Patterns
function testToolSearchPatterns() {
  logger.info('\n=== Test 5: Tool Search Patterns ===');

  // Test exact match
  let results = searchTools('Read');
  assert(results.length === 1, 'Exact match should find 1 tool');
  assert(results[0].name === 'Read', 'Should find Read');

  // Test wildcard *
  results = searchTools('Web*');
  logger.info(`'Web*' matched ${results.length} tools: ${results.map(t => t.name).join(', ')}`);
  assert(results.length >= 2, 'Should find WebFetch and WebSearch');

  // Test wildcard ?
  results = searchTools('Rea?');
  assert(results.length === 1, 'Should find Read with ? wildcard');

  // Test case insensitive
  results = searchTools('read');
  assert(results.length === 1, 'Should find Read (case insensitive)');

  // Test no match
  results = searchTools('NonExistent');
  assert(results.length === 0, 'Should find no matches');

  logger.info('✅ Tool Search Patterns tests passed');
}

// Test 6: Large Parameter Truncation
function testLargeParameterTruncation() {
  logger.info('\n=== Test 6: Large Parameter Truncation ===');

  const db = setupTestDb();
  const userId = 'test_user';
  const sessionId = 'sess_test123';

  // Create large parameter object
  const largeParams = {
    data: 'x'.repeat(100000) // 100KB of data
  };

  logger.info(`Logging tool with ${JSON.stringify(largeParams).length} byte parameters...`);

  db.logToolExecution(
    userId,
    sessionId,
    'Write',
    largeParams,
    null,
    'success',
    200
  );

  // Retrieve and check
  const log = db.getToolAuditLog(userId, 1, 0);
  assert(log.length === 1, 'Should have 1 entry');

  const paramLength = log[0].parameters ? log[0].parameters.length : 0;
  logger.info(`Stored parameter length: ${paramLength}`);
  assert(paramLength <= 50100, 'Parameters should be truncated to ~50KB + suffix');

  cleanupTestDb();
  logger.info('✅ Large Parameter Truncation tests passed');
}

// Simple assertion helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Run all tests
async function runTests() {
  logger.info('🧪 Running Tool Commands Test Suite\n');

  try {
    testToolRegistry();
    testToolAuditLog();
    testToolPermissions();
    testToolAuditCleanup();
    testToolSearchPatterns();
    testLargeParameterTruncation();

    logger.info('\n✅ All tests passed!');
    process.exit(0);
  } catch (error) {
    logger.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}

export { runTests };
