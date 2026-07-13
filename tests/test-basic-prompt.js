/**
 * Test 1: Basic Spawn & Prompt
 * Tests basic session creation and simple prompt-response flow
 */

import { DirectClaudeSpawner } from '../src/claude/direct-spawner.js';

async function testBasicPrompt() {
  console.log('🧪 Test 1: Basic Spawn & Prompt\n');

  const spawner = new DirectClaudeSpawner({
    projectPath: 'D:/working/gatrion/codebridge/tests/fixtures/test-project'
    // Use Claude CLI's built-in config (kreova endpoint already configured)
  });

  let fullText = '';

  // Setup event listeners
  spawner.on('text', ({ userId, text }) => {
    process.stdout.write(text);
    fullText += text;
  });

  spawner.on('thinking', ({ userId, thinking }) => {
    console.log(`\n💭 [Thinking]: ${thinking}`);
  });

  spawner.on('turn-end', ({ userId, stopReason }) => {
    console.log(`\n\n✅ Turn completed: ${stopReason}`);
    console.log(`\nFull response length: ${fullText.length} chars`);
    console.log(`Full response: "${fullText.trim()}"`);

    spawner.closeSession(userId).then(() => {
      console.log('\n✅ Test passed!');
      process.exit(0);
    });
  });

  spawner.on('error', ({ userId, error }) => {
    console.error('\n❌ Error:', error.message);
    spawner.closeSession(userId).catch(() => {});
    process.exit(1);
  });

  spawner.on('session-closed', ({ userId, code, signal }) => {
    console.log(`\n🔒 Session closed: code=${code}, signal=${signal}`);
  });

  spawner.on('stderr', ({ userId, data }) => {
    console.error('[STDERR]', data.toString());
  });

  spawner.on('debug', (msg) => {
    console.log('[DEBUG]', msg);
  });

  try {
    // Create session
    console.log('Creating session...');
    const session = await spawner.createSession('test-user');
    console.log('✅ Session created\n');

    // Send prompt
    console.log('Sending prompt: "Say hello world in 5 words or less"\n');
    console.log('Response: ');
    await session.sendPrompt('Say hello world in 5 words or less');

    // Wait for response (turn-end handler will close session)
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    await spawner.cleanup().catch(() => {});
    process.exit(1);
  }
}

testBasicPrompt();
