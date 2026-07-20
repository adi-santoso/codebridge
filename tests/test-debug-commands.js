/**
 * Test Suite for Debug Commands (Phase 6)
 *
 * Tests:
 * - Error logging
 * - Debug mode toggle
 * - Metrics calculation
 * - Log retrieval and pagination
 * - Automatic cleanup
 */

import { SessionDatabase } from '../src/database/session-db.js';
import { Logger } from '../src/utils/logger.js';
import assert from 'assert';
import { unlink } from 'fs/promises';

const TEST_DB_PATH = './.codebridge/test-debug.db';
const TEST_USER = '628123456789';
const TEST_SESSION = 'sess_test123';

/**
 * Test error logging
 */
async function testErrorLogging() {
  console.log('\n🔍 Test: Error Logging');

  const db = new SessionDatabase({ path: TEST_DB_PATH });

  try {
    // Create test session
    db.createSession(TEST_USER, TEST_SESSION);

    // Log various error types
    db.logError(
      TEST_USER,
      TEST_SESSION,
      'COMMAND_ERROR',
      'Invalid command syntax',
      null,
      { command: 'test', args: ['invalid'] }
    );

    db.logError(
      TEST_USER,
      TEST_SESSION,
      'TOOL_ERROR',
      'Tool execution failed',
      'Error: Tool failed\n  at line 1',
      { tool: 'Bash', command: 'invalid-cmd' }
    );

    db.logError(
      TEST_USER,
      TEST_SESSION,
      'TIMEOUT_ERROR',
      'Operation timed out',
      null,
      { timeout: 5000 }
    );

    // Get error history
    const errors = db.getErrorHistory(TEST_USER, 10, 0);
    assert.strictEqual(errors.length, 3, 'Should have 3 errors');

    // Check error types
    const errorTypes = new Set(errors.map(e => e.errorType));
    assert.strictEqual(errorTypes.size, 3, 'Should have 3 different error types');

    // Get error count
    const count = db.getErrorCount(TEST_USER);
    assert.strictEqual(count, 3, 'Total error count should be 3');

    // Filter by error type
    const commandErrors = db.getErrorHistory(TEST_USER, 10, 0, { errorType: 'COMMAND_ERROR' });
    assert.strictEqual(commandErrors.length, 1, 'Should have 1 COMMAND_ERROR');

    // Filter by session
    const sessionErrors = db.getErrorHistory(TEST_USER, 10, 0, { sessionId: TEST_SESSION });
    assert.strictEqual(sessionErrors.length, 3, 'Should have 3 errors for session');

    console.log('✅ Error logging test passed');
  } finally {
    db.close();
  }
}

/**
 * Test debug mode toggle
 */
async function testDebugMode() {
  console.log('\n🔍 Test: Debug Mode Toggle');

  const db = new SessionDatabase({ path: TEST_DB_PATH });
  const logger = new Logger('TestLogger');

  try {
    // Note: Session was already created in previous test, no need to recreate

    // Enable debug mode
    db.setUserPreference(TEST_USER, 'debugMode', true);
    logger.setDebugMode(TEST_USER, true);

    // Check debug mode is enabled
    const prefs = db.getUserPreferences(TEST_USER);
    assert.strictEqual(prefs.debugMode, 1, 'Debug mode should be enabled in DB');
    assert.strictEqual(logger.isDebugEnabled(TEST_USER), true, 'Debug mode should be enabled in logger');

    // Log some debug messages
    logger.userDebug(TEST_USER, 'Test debug message 1');
    logger.userDebug(TEST_USER, 'Test debug message 2');
    logger.userInfo(TEST_USER, 'Test info message');
    logger.userError(TEST_USER, 'Test error message');

    // Get debug logs
    const logs = logger.getDebugLogs(TEST_USER, 10);
    assert.strictEqual(logs.length, 4, 'Should have 4 log entries');

    // Check log levels
    const debugLogs = logs.filter(l => l.level === 'debug');
    assert.strictEqual(debugLogs.length, 2, 'Should have 2 debug logs');

    // Disable debug mode
    db.setUserPreference(TEST_USER, 'debugMode', false);
    logger.setDebugMode(TEST_USER, false);

    // Check debug mode is disabled
    const prefs2 = db.getUserPreferences(TEST_USER);
    assert.strictEqual(prefs2.debugMode, 0, 'Debug mode should be disabled in DB');
    assert.strictEqual(logger.isDebugEnabled(TEST_USER), false, 'Debug mode should be disabled in logger');

    // Logs should be cleared
    const logs2 = logger.getDebugLogs(TEST_USER, 10);
    assert.strictEqual(logs2.length, 0, 'Logs should be cleared after disabling');

    console.log('✅ Debug mode toggle test passed');
  } finally {
    db.close();
  }
}

/**
 * Test metrics calculation
 */
async function testMetrics() {
  console.log('\n🔍 Test: Metrics Calculation');

  const db = new SessionDatabase({ path: TEST_DB_PATH });

  try {
    // Note: Session already exists from previous tests

    // Insert command history
    db.insertCommandHistory({
      userId: TEST_USER,
      sessionId: TEST_SESSION,
      command: 'help',
      args: null,
      result: 'Help message',
      success: true,
      executedAt: Date.now()
    });

    db.insertCommandHistory({
      userId: TEST_USER,
      sessionId: TEST_SESSION,
      command: 'status',
      args: null,
      result: 'Status message',
      success: true,
      executedAt: Date.now()
    });

    db.insertCommandHistory({
      userId: TEST_USER,
      sessionId: TEST_SESSION,
      command: 'invalid',
      args: null,
      result: 'Error',
      success: false,
      executedAt: Date.now()
    });

    // Insert tool audit entries
    db.logToolExecution(TEST_USER, TEST_SESSION, 'Read', {}, {}, 'success', 150);
    db.logToolExecution(TEST_USER, TEST_SESSION, 'Write', {}, {}, 'success', 200);
    db.logToolExecution(TEST_USER, TEST_SESSION, 'Bash', {}, {}, 'error', 100, 'Command failed');
    db.logToolExecution(TEST_USER, TEST_SESSION, 'Read', {}, {}, 'cancelled', 50, null, TEST_USER);

    // Insert errors
    db.logError(TEST_USER, TEST_SESSION, 'COMMAND_ERROR', 'Test error 1');
    db.logError(TEST_USER, TEST_SESSION, 'TOOL_ERROR', 'Test error 2');

    // Get metrics
    const metrics = db.getSessionMetrics(TEST_USER, TEST_SESSION);

    // Verify command metrics
    assert.strictEqual(metrics.commandCount, 3, 'Should have 3 commands');
    assert.strictEqual(metrics.commandSuccess, 2, 'Should have 2 successful commands');
    assert.strictEqual(metrics.commandFailed, 1, 'Should have 1 failed command');

    // Verify tool metrics
    assert.strictEqual(metrics.toolCount, 4, 'Should have 4 tool executions');
    assert.strictEqual(metrics.toolSuccess, 2, 'Should have 2 successful tools');
    assert.strictEqual(metrics.toolFailed, 1, 'Should have 1 failed tool');
    assert.strictEqual(metrics.toolCancelled, 1, 'Should have 1 cancelled tool');

    // Verify average duration
    assert.ok(metrics.avgToolDuration > 0, 'Should have average tool duration');

    // Verify error metrics (may be more from previous tests)
    assert.ok(metrics.errorCount >= 2, `Should have at least 2 errors, got ${metrics.errorCount}`);

    // Verify top commands
    assert.ok(metrics.topCommands.length > 0, 'Should have top commands');

    // Verify top tools
    assert.ok(metrics.topTools.length > 0, 'Should have top tools');

    // Verify errors by type (may be more from previous tests)
    assert.ok(metrics.errorsByType.length >= 2, `Should have at least 2 error types, got ${metrics.errorsByType.length}`);

    console.log('✅ Metrics calculation test passed');
  } finally {
    db.close();
  }
}

/**
 * Test log pagination
 */
async function testLogPagination() {
  console.log('\n🔍 Test: Log Pagination');

  const logger = new Logger('TestLogger');

  try {
    // Enable debug mode
    logger.setDebugMode(TEST_USER, true);

    // Add many log entries
    for (let i = 0; i < 100; i++) {
      logger.userDebug(TEST_USER, `Debug message ${i}`);
    }

    // Get first 10
    const logs1 = logger.getDebugLogs(TEST_USER, 10);
    assert.strictEqual(logs1.length, 10, 'Should get 10 logs');

    // Get last 50
    const logs2 = logger.getDebugLogs(TEST_USER, 50);
    assert.strictEqual(logs2.length, 50, 'Should get 50 logs');

    // Get all
    const logs3 = logger.getDebugLogs(TEST_USER, 200);
    assert.strictEqual(logs3.length, 100, 'Should get all 100 logs');

    // Verify order (should be chronological)
    assert.ok(logs3[0].timestamp <= logs3[logs3.length - 1].timestamp, 'Logs should be in chronological order');

    console.log('✅ Log pagination test passed');
  } finally {
    logger.setDebugMode(TEST_USER, false);
  }
}

/**
 * Test automatic cleanup
 */
async function testAutoCleanup() {
  console.log('\n🔍 Test: Automatic Cleanup');

  // Set low max entries for testing BEFORE creating instances
  const oldErrorMax = process.env.ERROR_HISTORY_MAX_ENTRIES;
  const oldLogMax = process.env.DEBUG_LOG_MAX_ENTRIES;
  process.env.ERROR_HISTORY_MAX_ENTRIES = '10';
  process.env.DEBUG_LOG_MAX_ENTRIES = '50';

  const db = new SessionDatabase({ path: TEST_DB_PATH });
  const logger = new Logger('TestLogger'); // Created AFTER setting env vars

  try {
    // Note: Session already exists from previous tests

    // Add more than max errors
    for (let i = 0; i < 20; i++) {
      db.logError(TEST_USER, TEST_SESSION, 'TEST_ERROR', `Error ${i}`);
    }

    // Check that only max entries are kept
    const errors = db.getErrorHistory(TEST_USER, 100, 0);
    assert.ok(errors.length <= 10, `Should keep only max error entries, got ${errors.length}`);

    // Test log rotation
    logger.setDebugMode(TEST_USER, true);

    for (let i = 0; i < 100; i++) {
      logger.userDebug(TEST_USER, `Debug ${i}`);
    }

    const logs = logger.getDebugLogs(TEST_USER, 200);
    assert.ok(logs.length <= 50, `Should keep only max log entries, got ${logs.length}`);

    console.log('✅ Automatic cleanup test passed');
  } finally {
    db.close();
    logger.setDebugMode(TEST_USER, false);

    // Restore env vars
    if (oldErrorMax) process.env.ERROR_HISTORY_MAX_ENTRIES = oldErrorMax;
    if (oldLogMax) process.env.DEBUG_LOG_MAX_ENTRIES = oldLogMax;
  }
}

/**
 * Test user preferences
 */
async function testUserPreferences() {
  console.log('\n🔍 Test: User Preferences');

  const db = new SessionDatabase({ path: TEST_DB_PATH });

  try {
    // Set individual preferences
    db.setUserPreference(TEST_USER, 'debugMode', true);
    db.setUserPreference(TEST_USER, 'responseMode', 'detailed');
    db.setUserPreference(TEST_USER, 'workingDirectory', '/home/user/projects');

    // Get all preferences
    const prefs = db.getUserPreferences(TEST_USER);
    assert.strictEqual(prefs.debugMode, 1, 'debugMode should be true');
    assert.strictEqual(prefs.responseMode, 'detailed', 'responseMode should be detailed');
    assert.strictEqual(prefs.workingDirectory, '/home/user/projects', 'workingDirectory should match');

    // Get individual preference
    const debugMode = db.getUserPreference(TEST_USER, 'debugMode');
    assert.strictEqual(debugMode, 1, 'Individual preference should match');

    // Update preference
    db.setUserPreference(TEST_USER, 'debugMode', false);
    const debugMode2 = db.getUserPreference(TEST_USER, 'debugMode');
    assert.strictEqual(debugMode2, 0, 'Updated preference should match');

    console.log('✅ User preferences test passed');
  } finally {
    db.close();
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('🧪 Starting Debug Commands Tests (Phase 6)\n');

  // Clean up any existing test database first
  try {
    await unlink(TEST_DB_PATH);
  } catch (e) {
    // Ignore if doesn't exist
  }

  try {
    await testErrorLogging();
    await testDebugMode();
    await testMetrics();
    await testLogPagination();
    await testAutoCleanup();
    await testUserPreferences();

    console.log('\n✅ All tests passed!\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Cleanup test database
    try {
      await unlink(TEST_DB_PATH);
      console.log('🧹 Test database cleaned up');
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// Run tests
runTests();
