/**
 * Manual test for refactored DirectClaudeSpawner
 * Tests stream handler integration
 */

import { DirectClaudeSpawner } from '../../src/claude/direct-spawner.js';

async function testSpawner() {
  console.log('🧪 Testing Refactored DirectClaudeSpawner\n');

  const spawner = new DirectClaudeSpawner({
    projectPath: 'D:/working/gatrion/codebridge/tests/fixtures/test-project',
    customEndpoint: 'http://localhost:8082/v1'
  });

  // Listen to events
  spawner.on('debug', (msg) => {
    if (typeof msg === 'string') {
      console.log(`[DEBUG] ${msg}`);
    } else if (msg && typeof msg === 'object') {
      console.log(`[DEBUG]`, msg);
    }
  });

  spawner.on('session-created', ({ userId }) => {
    console.log(`✅ Session created: ${userId}`);
  });

  spawner.on('text', ({ userId, text }) => {
    process.stdout.write(text);
  });

  spawner.on('thinking', ({ userId, thinking }) => {
    console.log(`\n💭 Thinking: ${thinking}`);
  });

  spawner.on('tool-use', ({ userId, tool }) => {
    console.log(`\n🔧 Tool: ${tool.name}`);
    console.log(`   Input: ${JSON.stringify(tool.input, null, 2)}`);
  });

  spawner.on('turn-end', ({ userId, stopReason }) => {
    console.log(`\n\n✅ Turn ended: ${stopReason}`);
  });

  spawner.on('error', ({ userId, error }) => {
    console.error(`\n❌ Error: ${error.message}`);
  });

  try {
    // Test 1: Create session
    console.log('Test 1: Create session...');
    const session = await spawner.createSession('test-user-1');
    console.log('✅ Session created\n');

    // Test 2: Get status
    console.log('Test 2: Get session status...');
    const status = spawner.getSessionStatus('test-user-1');
    console.log('Status:', JSON.stringify(status, null, 2));
    console.log('✅ Status retrieved\n');

    // Test 3: Send simple prompt
    console.log('Test 3: Send prompt...');
    console.log('Prompt: "List files in current directory"\n');
    await session.sendPrompt('List files in current directory');

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Test 4: Close session
    console.log('\n\nTest 4: Close session...');
    await spawner.closeSession('test-user-1');
    console.log('✅ Session closed\n');

    console.log('✅ All tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);

    await spawner.cleanup().catch(() => {});
    process.exit(1);
  }
}

testSpawner();
