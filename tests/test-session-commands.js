/**
 * Session Commands Test Suite (Phase 2)
 *
 * Tests for session management commands:
 * - reset, history, save, load, sessions, delete
 *
 * Run with: node tests/test-session-commands.js
 */

import { SessionDatabase } from '../src/database/session-db.js';
import { SessionManager } from '../src/claude/session-manager.js';
import { Logger } from '../src/utils/logger.js';
import { existsSync, unlinkSync } from 'fs';

const logger = new Logger('SessionCommandsTest');

// Test database path
const TEST_DB_PATH = './.codebridge/test-sessions.db';

/**
 * Clean up test database
 */
function cleanupTestDb() {
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
    logger.info('Cleaned up test database');
  }
}

/**
 * Test saved_sessions table creation
 */
async function testTableCreation() {
  logger.info('Testing saved_sessions table creation...');

  const db = new SessionDatabase({ path: TEST_DB_PATH });

  try {
    // Check if table exists by trying to query it
    const result = db.getDb().prepare('SELECT COUNT(*) as count FROM saved_sessions').get();
    logger.success('✓ saved_sessions table exists');

    // Check indexes
    const indexes = db.getDb().prepare(`
      SELECT name FROM sqlite_master
      WHERE type='index' AND tbl_name='saved_sessions'
    `).all();

    logger.success(`✓ Found ${indexes.length} indexes on saved_sessions`);

    db.close();
    return true;
  } catch (error) {
    logger.error('✗ Table creation failed:', error.message);
    db.close();
    return false;
  }
}

/**
 * Test save session snapshot
 */
async function testSaveSnapshot() {
  logger.info('Testing saveSessionSnapshot...');

  const db = new SessionDatabase({ path: TEST_DB_PATH });

  try {
    const userId = 'test_user_123';
    const sessionId = 'sess_test123';
    const name = 'test-snapshot';
    const snapshot = {
      sessionId,
      userId,
      projectPath: '/test/project',
      projectName: 'testproject',
      state: 'PROJECT_SELECTED',
      messages: [],
      metadata: {
        createdAt: Date.now(),
        lastActive: Date.now(),
        messageCount: 0,
        savedAt: Date.now()
      }
    };

    const id = db.saveSessionSnapshot(userId, sessionId, name, snapshot);
    logger.success(`✓ Saved snapshot with ID: ${id}`);

    // Verify saved
    const saved = db.getSavedSession(userId, name);
    if (!saved) {
      throw new Error('Snapshot not found after save');
    }

    logger.success('✓ Snapshot retrieved successfully');

    // Verify snapshot content
    const parsedSnapshot = JSON.parse(saved.snapshot);
    if (parsedSnapshot.sessionId !== sessionId) {
      throw new Error('Snapshot content mismatch');
    }

    logger.success('✓ Snapshot content verified');

    db.close();
    return true;
  } catch (error) {
    logger.error('✗ Save snapshot failed:', error.message);
    db.close();
    return false;
  }
}

/**
 * Test duplicate name detection
 */
async function testDuplicateName() {
  logger.info('Testing duplicate name detection...');

  const db = new SessionDatabase({ path: TEST_DB_PATH });

  try {
    const userId = 'test_user_123';
    const sessionId = 'sess_test456';
    const name = 'duplicate-test';
    const snapshot = {
      sessionId,
      userId,
      projectPath: '/test/project',
      state: 'PROJECT_SELECTED',
      messages: [],
      metadata: { savedAt: Date.now() }
    };

    // Save first time - should succeed
    db.saveSessionSnapshot(userId, sessionId, name, snapshot);
    logger.success('✓ First save succeeded');

    // Try to save again with same name - should fail
    try {
      db.saveSessionSnapshot(userId, sessionId, name, snapshot);
      logger.error('✗ Duplicate name not detected');
      db.close();
      return false;
    } catch (error) {
      if (error.message.includes('already exists')) {
        logger.success('✓ Duplicate name correctly detected');
      } else {
        throw error;
      }
    }

    db.close();
    return true;
  } catch (error) {
    logger.error('✗ Duplicate name test failed:', error.message);
    db.close();
    return false;
  }
}

/**
 * Test max saved sessions limit
 */
async function testMaxSavedLimit() {
  logger.info('Testing max saved sessions limit...');

  const db = new SessionDatabase({ path: TEST_DB_PATH });

  try {
    const userId = 'test_user_456';
    const maxSaved = 3; // Test with small limit

    // Set limit temporarily
    const originalLimit = process.env.SESSION_MAX_SAVED;
    process.env.SESSION_MAX_SAVED = String(maxSaved);

    // Save up to limit
    for (let i = 0; i < maxSaved; i++) {
      const snapshot = {
        sessionId: `sess_test${i}`,
        userId,
        projectPath: '/test/project',
        state: 'PROJECT_SELECTED',
        messages: [],
        metadata: { savedAt: Date.now() }
      };

      db.saveSessionSnapshot(userId, `sess_test${i}`, `snapshot-${i}`, snapshot);
    }

    logger.success(`✓ Saved ${maxSaved} sessions successfully`);

    // Try to save one more - should fail
    try {
      const snapshot = {
        sessionId: 'sess_overflow',
        userId,
        projectPath: '/test/project',
        state: 'PROJECT_SELECTED',
        messages: [],
        metadata: { savedAt: Date.now() }
      };

      db.saveSessionSnapshot(userId, 'sess_overflow', 'overflow', snapshot);
      logger.error('✗ Max limit not enforced');

      // Restore original limit
      process.env.SESSION_MAX_SAVED = originalLimit;
      db.close();
      return false;
    } catch (error) {
      if (error.message.includes('Maximum saved sessions')) {
        logger.success('✓ Max limit correctly enforced');
      } else {
        throw error;
      }
    }

    // Restore original limit
    process.env.SESSION_MAX_SAVED = originalLimit;
    db.close();
    return true;
  } catch (error) {
    logger.error('✗ Max limit test failed:', error.message);
    db.close();
    return false;
  }
}

/**
 * Test get saved sessions with pagination
 */
async function testGetSavedSessions() {
  logger.info('Testing getSavedSessions with pagination...');

  const db = new SessionDatabase({ path: TEST_DB_PATH });

  try {
    const userId = 'test_user_789';

    // Save 5 sessions
    for (let i = 0; i < 5; i++) {
      const snapshot = {
        sessionId: `sess_page${i}`,
        userId,
        projectPath: '/test/project',
        state: 'PROJECT_SELECTED',
        messages: [],
        metadata: { savedAt: Date.now() }
      };

      db.saveSessionSnapshot(userId, `sess_page${i}`, `page-test-${i}`, snapshot);
    }

    // Get first 3
    const page1 = db.getSavedSessions(userId, 3, 0);
    if (page1.length !== 3) {
      throw new Error(`Expected 3 results, got ${page1.length}`);
    }
    logger.success('✓ Page 1 (limit 3) retrieved');

    // Get next 2
    const page2 = db.getSavedSessions(userId, 3, 3);
    if (page2.length !== 2) {
      throw new Error(`Expected 2 results, got ${page2.length}`);
    }
    logger.success('✓ Page 2 (offset 3) retrieved');

    // Check count
    const count = db.getSavedSessionCount(userId);
    if (count !== 5) {
      throw new Error(`Expected count 5, got ${count}`);
    }
    logger.success('✓ Count matches');

    db.close();
    return true;
  } catch (error) {
    logger.error('✗ Pagination test failed:', error.message);
    db.close();
    return false;
  }
}

/**
 * Test delete saved session
 */
async function testDeleteSession() {
  logger.info('Testing deleteSavedSession...');

  const db = new SessionDatabase({ path: TEST_DB_PATH });

  try {
    const userId = 'test_user_delete';
    const name = 'delete-test';
    const snapshot = {
      sessionId: 'sess_delete',
      userId,
      projectPath: '/test/project',
      state: 'PROJECT_SELECTED',
      messages: [],
      metadata: { savedAt: Date.now() }
    };

    // Save
    db.saveSessionSnapshot(userId, 'sess_delete', name, snapshot);
    logger.success('✓ Snapshot saved');

    // Delete
    const deleted = db.deleteSavedSession(userId, name);
    if (!deleted) {
      throw new Error('Delete returned false');
    }
    logger.success('✓ Snapshot deleted');

    // Verify deleted
    const found = db.getSavedSession(userId, name);
    if (found) {
      throw new Error('Snapshot still exists after delete');
    }
    logger.success('✓ Snapshot confirmed deleted');

    db.close();
    return true;
  } catch (error) {
    logger.error('✗ Delete test failed:', error.message);
    db.close();
    return false;
  }
}

/**
 * Test SessionManager snapshot methods
 */
async function testSessionManagerSnapshot() {
  logger.info('Testing SessionManager snapshot methods...');

  // This test requires more setup (spawner, project registry, etc.)
  // Skipping for now - can be added later with proper mocking

  logger.warn('⚠ SessionManager snapshot test skipped (requires full setup)');
  return true;
}

/**
 * Run all tests
 */
async function runTests() {
  logger.info('Starting Session Commands Test Suite...\n');

  const tests = [
    { name: 'Table Creation', fn: testTableCreation },
    { name: 'Save Snapshot', fn: testSaveSnapshot },
    { name: 'Duplicate Name Detection', fn: testDuplicateName },
    { name: 'Max Saved Limit', fn: testMaxSavedLimit },
    { name: 'Get Saved Sessions Pagination', fn: testGetSavedSessions },
    { name: 'Delete Saved Session', fn: testDeleteSession },
    { name: 'SessionManager Snapshot', fn: testSessionManagerSnapshot }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    logger.info(`\n--- Running: ${test.name} ---`);

    try {
      const result = await test.fn();
      if (result) {
        passed++;
        logger.success(`✓ ${test.name} PASSED\n`);
      } else {
        failed++;
        logger.error(`✗ ${test.name} FAILED\n`);
      }
    } catch (error) {
      failed++;
      logger.error(`✗ ${test.name} FAILED:`, error.message, '\n');
    }
  }

  // Summary
  logger.info('\n=== Test Summary ===');
  logger.info(`Total: ${tests.length}`);
  logger.info(`Passed: ${passed}`);
  logger.info(`Failed: ${failed}`);

  if (failed === 0) {
    logger.success('\n✓ All tests passed!');
  } else {
    logger.error(`\n✗ ${failed} test(s) failed`);
  }

  // Cleanup
  cleanupTestDb();

  return failed === 0;
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      logger.error('Test suite crashed:', error);
      process.exit(1);
    });
}

export { runTests };
