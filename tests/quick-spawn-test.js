import { DirectClaudeSpawner } from '../src/claude/direct-spawner.js';
import config from '../src/utils/config.js';

/**
 * Quick Test: Direct Claude Spawn with Custom Endpoint
 *
 * This tests if Opsi A (direct spawn) works and avoids exit code 143
 *
 * Run: node tests/quick-spawn-test.js
 */

async function runTest() {
  console.log('='.repeat(60));
  console.log('Quick Spawn Test - Direct Claude CLI with Custom Endpoint');
  console.log('='.repeat(60));
  console.log();

  // Create spawner
  const spawner = new DirectClaudeSpawner({
    apiKey: config.anthropic.apiKey,
    customEndpoint: config.anthropic.customEndpoint,
    projectPath: config.project.defaultPath,
    model: config.anthropic.model
  });

  // Setup event listeners for debugging
  spawner.on('debug', (msg) => console.log('[DEBUG]', msg));
  spawner.on('warn', (msg) => console.warn('[WARN]', msg));
  spawner.on('error', ({ userId, error }) => console.error('[ERROR]', userId, error.message));
  spawner.on('session-created', ({ userId, sessionId }) => {
    console.log('✅ Session created:', userId, '→', sessionId);
  });
  spawner.on('session-crashed', ({ userId, code, signal }) => {
    console.error('❌ Session crashed:', userId, '- code:', code, 'signal:', signal);
  });
  spawner.on('text', ({ userId, text }) => {
    process.stdout.write(text);
  });
  spawner.on('stderr', ({ userId, data }) => {
    console.error('[STDERR]', userId, ':', data);
  });

  const testUserId = 'test-user';
  let success = false;

  try {
    console.log('1️⃣ Health Check...');
    const health = await spawner.healthCheck();
    console.log('Health:', JSON.stringify(health, null, 2));
    console.log();

    if (!health.healthy) {
      throw new Error('Health check failed: ' + health.error);
    }

    console.log('2️⃣ Creating session...');
    const session = await spawner.createSession(testUserId, {
      cwd: config.project.defaultPath
    });
    console.log('Session ID:', session.sessionId);
    console.log('Session ready:', session.isReady);
    console.log();

    console.log('3️⃣ Sending test prompt...');
    console.log('Prompt: "list files in current directory"');
    console.log('Response:');
    console.log('-'.repeat(60));

    const response = await spawner.sendMessage(
      testUserId,
      'list files in current directory',
      { cwd: config.project.defaultPath }
    );

    console.log('-'.repeat(60));
    console.log();
    console.log('Response received:');
    console.log('Text length:', response.text.length);
    console.log('Tools used:', response.toolsUsed.length);
    console.log();

    console.log('4️⃣ Closing session...');
    await spawner.closeSession(testUserId);
    console.log('Session closed');
    console.log();

    success = true;
    console.log('✅ TEST PASSED - No exit code 143!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error();
    console.error('❌ TEST FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('='.repeat(60));

    // Check if it's the dreaded exit code 143
    if (error.message.includes('143') || error.message.includes('SIGTERM')) {
      console.error();
      console.error('⚠️  EXIT CODE 143 DETECTED!');
      console.error('Opsi A did not solve the problem.');
      console.error('Next step: Investigate Opsi C (debug SDK)');
    }

    // Cleanup
    try {
      await spawner.closeSession(testUserId);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    process.exit(1);
  }

  if (success) {
    console.log();
    console.log('Next steps:');
    console.log('1. Run integration tests');
    console.log('2. Test via WhatsApp');
    console.log('3. Monitor for stability');
    process.exit(0);
  }
}

// Run test
runTest().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
