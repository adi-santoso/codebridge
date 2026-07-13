/**
 * Basic Import Test
 * Test if all new modules can be imported without errors
 */

console.log('[Test] Starting import test...\n');

try {
  // Test GatewayClient
  console.log('[Test] Importing GatewayClient...');
  const { default: GatewayClient } = await import('./src/gateway-client.js');
  console.log('✅ GatewayClient imported');

  // Test SessionRoomManager
  console.log('[Test] Importing SessionRoomManager...');
  const { default: SessionRoomManager } = await import('./src/session-room-manager.js');
  console.log('✅ SessionRoomManager imported');

  // Test SessionManager
  console.log('[Test] Importing SessionManager...');
  const { SessionManager } = await import('./src/claude/session-manager.js');
  console.log('✅ SessionManager imported');

  // Test MessageHandler
  console.log('[Test] Importing MessageHandler...');
  const { MessageHandler } = await import('./src/whatsapp/message-handler.js');
  console.log('✅ MessageHandler imported');

  // Test SessionDatabase
  console.log('[Test] Importing SessionDatabase...');
  const { SessionDatabase } = await import('./src/database/session-db.js');
  console.log('✅ SessionDatabase imported');

  console.log('\n[Test] All imports successful! ✅');
  console.log('\n[Test] Testing class instantiation...\n');

  // Test GatewayClient instantiation
  console.log('[Test] Creating GatewayClient instance...');
  const gatewayClient = new GatewayClient({
    gatewayUrl: 'http://localhost:3000',
    authKey: 'test-key'
  });
  console.log('✅ GatewayClient instance created');

  // Test SessionDatabase instantiation
  console.log('[Test] Creating SessionDatabase instance (test DB)...');
  const db = new SessionDatabase({
    path: './.codebridge/test-sessions.db'
  });
  console.log('✅ SessionDatabase instance created');

  // Test SessionManager instantiation
  console.log('[Test] Creating SessionManager instance...');
  const sessionManager = new SessionManager({
    dbPath: './.codebridge/test-sessions.db'
  });
  console.log('✅ SessionManager instance created');

  // Test SessionRoomManager instantiation
  console.log('[Test] Creating SessionRoomManager instance...');
  const roomManager = new SessionRoomManager(gatewayClient, sessionManager);
  console.log('✅ SessionRoomManager instance created');

  // Test MessageHandler instantiation
  console.log('[Test] Creating MessageHandler instance...');
  const messageHandler = new MessageHandler({
    sessionManager: sessionManager,
    projectRootPath: 'D:/working/gatrion'
  });
  console.log('✅ MessageHandler instance created');

  console.log('\n[Test] All instantiations successful! ✅');
  console.log('\n[Test] Testing SessionManager methods...\n');

  // Test SessionManager initialize
  console.log('[Test] Calling SessionManager.initialize()...');
  await sessionManager.initialize();
  console.log('✅ SessionManager initialized');

  // Test getAllSessions
  console.log('[Test] Calling SessionManager.getAllSessions()...');
  const allSessions = sessionManager.getAllSessions();
  console.log(`✅ getAllSessions returned ${allSessions.length} sessions`);

  // Test getTotalSessions
  console.log('[Test] Calling SessionManager.getTotalSessions()...');
  const total = sessionManager.getTotalSessions();
  console.log(`✅ getTotalSessions returned ${total}`);

  // Test getActiveSessions
  console.log('[Test] Calling SessionManager.getActiveSessions()...');
  const active = sessionManager.getActiveSessions();
  console.log(`✅ getActiveSessions returned ${active.length} sessions`);

  console.log('\n[Test] All tests passed! ✅✅✅');
  console.log('\n[Test] CodeBridge is ready to run! 🚀');

  // Cleanup
  await sessionManager.shutdown();
  console.log('\n[Test] Cleaned up');

  // Delete test database
  const fs = await import('fs');
  try {
    fs.unlinkSync('./.codebridge/test-sessions.db');
    console.log('[Test] Test database deleted');
  } catch (e) {
    // Ignore
  }

} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
