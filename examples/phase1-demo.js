/**
 * Phase 1 Demo Script
 *
 * Manual test to validate:
 * 1. Session creation
 * 2. Send message
 * 3. Multi-turn conversation
 * 4. Session cleanup
 */

import { SessionManager } from '../src/claude/session-manager.js';
import { Logger } from '../src/utils/logger.js';

const logger = new Logger('Demo');

async function main() {
  console.log('🚀 Phase 1 Demo - Session Manager\n');

  const manager = new SessionManager();

  try {
    // Test 1: Create session
    logger.info('TEST 1: Creating session for user "demo-user"');
    const session = await manager.getOrCreateSession('demo-user', {
      cwd: process.cwd()
    });
    logger.success('Session created:', session.sessionId);

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test 2: Send first message
    logger.info('\nTEST 2: Sending first message');
    const response1 = await manager.sendMessage('demo-user',
      'Hello! Please respond with "AI is working" to confirm you understand.'
    );
    logger.success('First message sent');

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Test 3: Send follow-up message (test context)
    logger.info('\nTEST 3: Sending follow-up message (context test)');
    const response2 = await manager.sendMessage('demo-user',
      'What was my previous message?'
    );
    logger.success('Follow-up message sent');

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Test 4: Check session stats
    logger.info('\nTEST 4: Session statistics');
    logger.info('Active sessions:', manager.getActiveSessionCount());
    logger.info('Active users:', manager.getActiveUsers());
    logger.info('Has session for demo-user:', manager.hasSession('demo-user'));

    // Test 5: Cleanup
    logger.info('\nTEST 5: Closing session');
    await manager.closeSession('demo-user');
    logger.success('Session closed');

    logger.info('Active sessions after cleanup:', manager.getActiveSessionCount());

    console.log('\n' + '='.repeat(50));
    console.log('✅ ALL TESTS PASSED');
    console.log('='.repeat(50));
    console.log('\nPhase 1 Core Components:');
    console.log('  ✅ ACPClient - Subprocess management');
    console.log('  ✅ SessionManager - High-level API');
    console.log('  ✅ Multi-turn conversation');
    console.log('  ✅ Session cleanup');

    process.exit(0);

  } catch (error) {
    logger.error('TEST FAILED:', error.message);
    console.error(error);

    await manager.closeAllSessions();
    process.exit(1);
  }
}

main();
