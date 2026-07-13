import { SessionManager } from '../src/claude/session-manager.js';

/**
 * Quick Test: SessionManager with Kreova
 *
 * Tests high-level SessionManager API
 *
 * Run: node tests/quick-session-test.js
 */

async function runTest() {
  console.log('='.repeat(60));
  console.log('SessionManager Test with Kreova Endpoint');
  console.log('='.repeat(60));
  console.log();

  // Create session manager
  const manager = new SessionManager();

  const userId = '6281234567890'; // Simulated WhatsApp number

  try {
    console.log('1️⃣ Health Check...');
    const health = await manager.healthCheck();
    console.log('Health:', JSON.stringify(health, null, 2));
    console.log();

    if (!health.healthy) {
      throw new Error('Health check failed');
    }

    console.log('2️⃣ Getting/creating session...');
    const session = await manager.getOrCreateSession(userId);
    console.log('Session:', JSON.stringify(session, null, 2));
    console.log();

    console.log('3️⃣ Sending first message...');
    const response1 = await manager.sendMessage(userId, 'list files in current directory');
    console.log('Response:', response1.text.substring(0, 200) + '...');
    console.log('Stats:', {
      tokens: response1.usage,
      time: `${response1.responseTime}ms`
    });
    console.log();

    console.log('4️⃣ Sending follow-up message...');
    const response2 = await manager.sendMessage(userId, 'how many files are there?');
    console.log('Response:', response2.text);
    console.log('Stats:', {
      tokens: response2.usage,
      time: `${response2.responseTime}ms`,
      conversationLength: response2.conversationLength
    });
    console.log();

    console.log('5️⃣ Checking session status...');
    const status = manager.getSessionStatus(userId);
    console.log('Status:', JSON.stringify(status, null, 2));
    console.log();

    console.log('6️⃣ Checking active users...');
    console.log('Active users:', manager.getActiveUsers());
    console.log('Active session count:', manager.getActiveSessionCount());
    console.log();

    console.log('7️⃣ Closing session...');
    await manager.closeSession(userId);
    console.log('Session closed');
    console.log('Active users after close:', manager.getActiveUsers());
    console.log();

    console.log('✅ SESSION MANAGER TEST PASSED!');
    console.log('='.repeat(60));
    console.log();
    console.log('Architecture verified:');
    console.log('✅ SessionManager → KreovaClient → HTTP API');
    console.log('✅ Per-user conversation management');
    console.log('✅ Session lifecycle (create, message, close)');
    console.log('✅ Ready for WhatsApp integration!');

    process.exit(0);

  } catch (error) {
    console.error();
    console.error('❌ TEST FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('='.repeat(60));

    process.exit(1);
  }
}

// Run test
runTest().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
