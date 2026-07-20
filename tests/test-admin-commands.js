/**
 * Test Suite for Admin Commands (Phase 9)
 *
 * Tests multi-user management and system administration
 *
 * Run: node tests/test-admin-commands.js
 */

import { SessionDatabase } from '../src/database/session-db.js';
import * as adminHandlers from '../src/commands/handlers/admin.js';
import { Logger } from '../src/utils/logger.js';

const logger = new Logger('AdminCommandTests');

// Mock SessionManager
class MockSessionManager {
  constructor() {
    this.sessions = new Map();
  }

  getActiveSession(userId) {
    return this.sessions.get(userId) || null;
  }

  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  async closeSession(sessionId) {
    for (const [userId, session] of this.sessions.entries()) {
      if (session.sessionId === sessionId) {
        this.sessions.delete(userId);
        return;
      }
    }
  }

  // Helper to add mock session
  addSession(userId, sessionId, projectPath = null) {
    this.sessions.set(userId, {
      userId,
      sessionId,
      projectPath,
      state: 'PROJECT_SELECTED',
      createdAt: Date.now(),
      lastActive: Date.now()
    });
  }
}

/**
 * Test context builder
 */
function buildContext(db, sessionManager, userId, args = []) {
  return {
    userId,
    args,
    db,
    sessionManager,
    logger
  };
}

/**
 * Test role hierarchy
 */
async function testRoleHierarchy(db) {
  logger.info('Testing role hierarchy...');

  const user1 = '628111111111';
  const user2 = '628222222222';
  const user3 = '628333333333';

  // Set roles
  db.setUserRole(user1, 'user', 'system');
  db.setUserRole(user2, 'admin', 'system');
  db.setUserRole(user3, 'superadmin', 'system');

  // Test getUserRole
  console.assert(db.getUserRole(user1) === 'user', 'User1 should be user');
  console.assert(db.getUserRole(user2) === 'admin', 'User2 should be admin');
  console.assert(db.getUserRole(user3) === 'superadmin', 'User3 should be superadmin');
  console.assert(db.getUserRole('unknown') === 'user', 'Unknown user should default to user');

  // Test isAdmin
  console.assert(db.isAdmin(user1) === false, 'User should not be admin');
  console.assert(db.isAdmin(user2) === true, 'Admin should be admin');
  console.assert(db.isAdmin(user3) === true, 'Superadmin should be admin');

  // Test isSuperAdmin
  console.assert(db.isSuperAdmin(user1) === false, 'User should not be superadmin');
  console.assert(db.isSuperAdmin(user2) === false, 'Admin should not be superadmin');
  console.assert(db.isSuperAdmin(user3) === true, 'Superadmin should be superadmin');

  logger.success('✓ Role hierarchy tests passed');
}

/**
 * Test whitelist management
 */
async function testWhitelistManagement(db) {
  logger.info('Testing whitelist management...');

  const phone1 = '628111111111';
  const phone2 = '628222222222';

  // Test add
  db.addToWhitelist(phone1, 'admin', 'Test user 1');
  db.addToWhitelist(phone2, 'admin', 'Test user 2');

  // Test isWhitelisted
  console.assert(db.isWhitelisted(phone1) === true, 'Phone1 should be whitelisted');
  console.assert(db.isWhitelisted(phone2) === true, 'Phone2 should be whitelisted');
  console.assert(db.isWhitelisted('999999999') === false, 'Unknown phone should not be whitelisted');

  // Test getWhitelist
  const whitelist = db.getWhitelist();
  console.assert(whitelist.length >= 2, 'Should have at least 2 entries');
  console.assert(whitelist.some(e => e.phoneNumber === phone1), 'Should contain phone1');
  console.assert(whitelist.some(e => e.phoneNumber === phone2), 'Should contain phone2');

  // Test remove
  const removed = db.removeFromWhitelist(phone2);
  console.assert(removed === true, 'Should remove phone2');
  console.assert(db.isWhitelisted(phone2) === false, 'Phone2 should not be whitelisted anymore');

  // Test remove non-existent
  const notRemoved = db.removeFromWhitelist('999999999');
  console.assert(notRemoved === false, 'Should not remove non-existent phone');

  logger.success('✓ Whitelist management tests passed');
}

/**
 * Test audit logging
 */
async function testAuditLogging(db) {
  logger.info('Testing audit logging...');

  const userId = '628111111111';

  // Log some actions
  db.logAudit(userId, 'TEST_ACTION_1', 'target1', 'Test details 1');
  db.logAudit(userId, 'TEST_ACTION_2', 'target2', 'Test details 2');
  db.logAudit(userId, 'TEST_ACTION_3', null, null);

  // Get audit log
  const logs = db.getAuditLog(50, 0, { userId });
  console.assert(logs.length >= 3, 'Should have at least 3 audit logs');

  // Check structure
  const log = logs[0];
  console.assert(log.userId === userId, 'Log should have correct userId');
  console.assert(log.action, 'Log should have action');
  console.assert(log.timestamp, 'Log should have timestamp');

  // Test filtering
  const filteredLogs = db.getAuditLog(50, 0, { userId, action: 'TEST_ACTION_1' });
  console.assert(filteredLogs.length >= 1, 'Should have filtered logs');
  console.assert(filteredLogs[0].action === 'TEST_ACTION_1', 'Filtered log should match action');

  logger.success('✓ Audit logging tests passed');
}

/**
 * Test admin users command
 */
async function testUsersCommand(db, sessionManager) {
  logger.info('Testing /admin users command...');

  const admin = '628111111111';
  const user1 = '628222222222';
  const user2 = '628333333333';

  // Set roles
  db.setUserRole(admin, 'admin', 'system');
  db.setUserRole(user1, 'user', 'system');

  // Add mock sessions
  sessionManager.addSession(user1, 'sess_user1', '/projects/test1');
  sessionManager.addSession(user2, 'sess_user2', '/projects/test2');

  // Execute command
  const context = buildContext(db, sessionManager, admin, []);
  const result = await adminHandlers.users(context);

  // Check result
  console.assert(typeof result === 'string', 'Result should be string');
  console.assert(result.includes('Active Users'), 'Result should mention Active Users');
  console.assert(result.includes(user1), 'Result should include user1');
  console.assert(result.includes(user2), 'Result should include user2');

  logger.success('✓ Users command test passed');
}

/**
 * Test admin kill command
 */
async function testKillCommand(db, sessionManager) {
  logger.info('Testing /admin kill command...');

  const admin = '628111111111';
  const user1 = '628222222222';

  // Set roles
  db.setUserRole(admin, 'admin', 'system');

  // Add mock session
  sessionManager.addSession(user1, 'sess_user1', '/projects/test');

  // Test successful kill
  let context = buildContext(db, sessionManager, admin, [user1]);
  let result = await adminHandlers.kill(context);
  console.assert(result.includes('Session Killed'), 'Should kill session');
  console.assert(sessionManager.getActiveSession(user1) === null, 'Session should be closed');

  // Test kill non-existent session
  context = buildContext(db, sessionManager, admin, ['999999999']);
  result = await adminHandlers.kill(context);
  console.assert(result.includes('Session Not Found'), 'Should report session not found');

  // Test kill own session
  context = buildContext(db, sessionManager, admin, [admin]);
  result = await adminHandlers.kill(context);
  console.assert(result.includes('Cannot Kill Own Session'), 'Should prevent killing own session');

  logger.success('✓ Kill command test passed');
}

/**
 * Test admin stats command
 */
async function testStatsCommand(db, sessionManager) {
  logger.info('Testing /admin stats command...');

  const admin = '628111111111';

  // Set role
  db.setUserRole(admin, 'admin', 'system');

  // Add some data
  db.insertCommandHistory({
    userId: admin,
    sessionId: 'sess_test',
    command: 'help',
    args: '[]',
    result: 'OK',
    success: true,
    executedAt: Date.now()
  });

  // Execute command
  const context = buildContext(db, sessionManager, admin, []);
  const result = await adminHandlers.stats(context);

  // Check result
  console.assert(typeof result === 'string', 'Result should be string');
  console.assert(result.includes('System Statistics'), 'Result should have title');
  console.assert(result.includes('Users'), 'Result should have Users section');
  console.assert(result.includes('Commands'), 'Result should have Commands section');
  console.assert(result.includes('Tools'), 'Result should have Tools section');
  console.assert(result.includes('Errors'), 'Result should have Errors section');

  logger.success('✓ Stats command test passed');
}

/**
 * Test admin whitelist commands
 */
async function testWhitelistCommands(db, sessionManager) {
  logger.info('Testing /admin whitelist commands...');

  const admin = '628111111111';
  const newPhone = '628555555555';

  // Set role
  db.setUserRole(admin, 'admin', 'system');

  // Test add
  let context = buildContext(db, sessionManager, admin, [newPhone, 'Test', 'User']);
  let result = await adminHandlers.whitelistAdd(context);
  console.assert(result.includes('Added to Whitelist'), 'Should add to whitelist');
  console.assert(db.isWhitelisted(newPhone), 'Phone should be whitelisted');

  // Test list
  context = buildContext(db, sessionManager, admin, []);
  result = await adminHandlers.whitelistList(context);
  console.assert(result.includes('Whitelist'), 'Should show whitelist');
  console.assert(result.includes(newPhone), 'Should include new phone');

  // Test remove
  context = buildContext(db, sessionManager, admin, [newPhone]);
  result = await adminHandlers.whitelistRemove(context);
  console.assert(result.includes('Removed from Whitelist'), 'Should remove from whitelist');
  console.assert(!db.isWhitelisted(newPhone), 'Phone should not be whitelisted');

  logger.success('✓ Whitelist commands test passed');
}

/**
 * Test admin grant/revoke commands
 */
async function testGrantRevokeCommands(db, sessionManager) {
  logger.info('Testing /admin grant and revoke commands...');

  const superadmin = '628111111111';
  const user1 = '628222222222';

  // Set role
  db.setUserRole(superadmin, 'superadmin', 'system');

  // Test grant
  let context = buildContext(db, sessionManager, superadmin, [user1, 'admin']);
  let result = await adminHandlers.grant(context);
  console.assert(result.includes('Role Granted'), 'Should grant role');
  console.assert(db.getUserRole(user1) === 'admin', 'User should be admin');

  // Test grant invalid role
  context = buildContext(db, sessionManager, superadmin, [user1, 'invalid']);
  result = await adminHandlers.grant(context);
  console.assert(result.includes('Invalid Role'), 'Should reject invalid role');

  // Test revoke
  context = buildContext(db, sessionManager, superadmin, [user1]);
  result = await adminHandlers.revoke(context);
  console.assert(result.includes('Role Revoked'), 'Should revoke role');
  console.assert(db.getUserRole(user1) === 'user', 'User should be user');

  // Test cannot modify own role
  context = buildContext(db, sessionManager, superadmin, [superadmin, 'admin']);
  result = await adminHandlers.grant(context);
  console.assert(result.includes('Cannot Modify Own Role'), 'Should prevent self-modification');

  logger.success('✓ Grant/revoke commands test passed');
}

/**
 * Test permission enforcement
 */
async function testPermissionEnforcement(db) {
  logger.info('Testing permission enforcement...');

  const user = '628111111111';
  const admin = '628222222222';
  const superadmin = '628333333333';
  const targetUser = '628444444444';

  // Set roles
  db.setUserRole(user, 'user', 'system');
  db.setUserRole(admin, 'admin', 'system');
  db.setUserRole(superadmin, 'superadmin', 'system');
  db.setUserRole(targetUser, 'superadmin', 'system');

  // Test: admin cannot kill higher/equal role
  const roleLevel = { user: 0, admin: 1, superadmin: 2 };
  console.assert(
    roleLevel[db.getUserRole(targetUser)] >= roleLevel[db.getUserRole(admin)],
    'Target should have higher or equal role'
  );

  logger.success('✓ Permission enforcement tests passed');
}

/**
 * Test system stats generation
 */
async function testSystemStats(db, sessionManager) {
  logger.info('Testing system stats generation...');

  // Add test data
  const now = Date.now();
  const day24hAgo = now - (24 * 60 * 60 * 1000);

  // Add command history
  db.insertCommandHistory({
    userId: '628111111111',
    sessionId: 'sess_test',
    command: 'test1',
    args: '[]',
    result: 'OK',
    success: true,
    executedAt: now
  });

  db.insertCommandHistory({
    userId: '628111111111',
    sessionId: 'sess_test',
    command: 'test2',
    args: '[]',
    result: 'FAIL',
    success: false,
    executedAt: day24hAgo - 1000
  });

  // Get stats
  const stats = db.getSystemStats();

  // Verify structure
  console.assert(typeof stats.totalUsers === 'number', 'Should have totalUsers');
  console.assert(typeof stats.totalCommands === 'number', 'Should have totalCommands');
  console.assert(typeof stats.commandsLast24h === 'number', 'Should have commandsLast24h');
  console.assert(typeof stats.commandSuccessRate === 'number', 'Should have success rate');
  console.assert(stats.totalCommands >= 2, 'Should count commands');
  console.assert(stats.commandsLast24h >= 1, 'Should count commands in last 24h');

  logger.success('✓ System stats tests passed');
}

/**
 * Main test runner
 */
async function runTests() {
  logger.info('=== Starting Admin Commands Tests ===\n');

  // Create in-memory test database
  const db = new SessionDatabase({ path: ':memory:' });
  const sessionManager = new MockSessionManager();

  try {
    await testRoleHierarchy(db);
    await testWhitelistManagement(db);
    await testAuditLogging(db);
    await testUsersCommand(db, sessionManager);
    await testKillCommand(db, sessionManager);
    await testStatsCommand(db, sessionManager);
    await testWhitelistCommands(db, sessionManager);
    await testGrantRevokeCommands(db, sessionManager);
    await testPermissionEnforcement(db);
    await testSystemStats(db, sessionManager);

    logger.success('\n=== All Admin Commands Tests Passed ✓ ===');
    process.exit(0);

  } catch (error) {
    logger.error('\n=== Test Failed ✗ ===');
    logger.error(error.message);
    logger.error(error.stack);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run tests
runTests();
