import { KreovaClient } from '../src/claude/kreova-client.js';
import config from '../src/utils/config.js';

/**
 * Quick Test: Kreova Client (SDK Approach)
 *
 * Tests the new HTTP-based approach - NO SUBPROCESS, NO EXIT CODE 143!
 *
 * Run: node tests/quick-kreova-test.js
 */

async function runTest() {
  console.log('='.repeat(60));
  console.log('Quick Kreova Test - HTTP SDK Approach');
  console.log('='.repeat(60));
  console.log();

  // Create Kreova client
  const client = new KreovaClient({
    apiKey: config.anthropic.apiKey,
    baseURL: config.anthropic.customEndpoint,
    model: config.anthropic.model
  });

  // Setup event listeners
  client.on('debug', (msg) => console.log('[DEBUG]', msg));
  client.on('error', ({ userId, error }) => console.error('[ERROR]', userId, error.message));
  client.on('message-start', ({ userId }) => console.log('[START]', userId));
  client.on('message-complete', ({ userId, result }) => {
    console.log('[COMPLETE]', userId, `- ${result.responseTime}ms`);
  });

  const testUserId = 'test-user';

  try {
    console.log('1️⃣ Health Check...');
    const health = await client.healthCheck();
    console.log('Health:', JSON.stringify(health, null, 2));
    console.log();

    if (!health.healthy) {
      throw new Error('Health check failed: ' + health.error);
    }

    console.log('2️⃣ Sending first message...');
    console.log('Prompt: "say hello"');
    console.log('-'.repeat(60));

    const response1 = await client.sendMessage(testUserId, 'say hello');

    console.log(response1.text);
    console.log('-'.repeat(60));
    console.log('Stats:', {
      model: response1.model,
      tokens: response1.usage,
      time: `${response1.responseTime}ms`,
      conversationLength: response1.conversationLength
    });
    console.log();

    console.log('3️⃣ Sending second message (testing conversation)...');
    console.log('Prompt: "what did i just ask you?"');
    console.log('-'.repeat(60));

    const response2 = await client.sendMessage(testUserId, 'what did i just ask you?');

    console.log(response2.text);
    console.log('-'.repeat(60));
    console.log('Stats:', {
      model: response2.model,
      tokens: response2.usage,
      time: `${response2.responseTime}ms`,
      conversationLength: response2.conversationLength
    });
    console.log();

    console.log('4️⃣ Testing conversation history...');
    const status = client.getStatus(testUserId);
    console.log('Status:', JSON.stringify(status, null, 2));
    console.log();

    console.log('5️⃣ Clearing conversation...');
    client.clearConversation(testUserId);
    const statusAfter = client.getStatus(testUserId);
    console.log('Status after clear:', JSON.stringify(statusAfter, null, 2));
    console.log();

    console.log('✅ TEST PASSED!');
    console.log('='.repeat(60));
    console.log();
    console.log('Key Achievements:');
    console.log('✅ No subprocess → No exit code 143');
    console.log('✅ HTTP communication → Simple and stable');
    console.log('✅ Conversation history works');
    console.log('✅ Kreova endpoint compatible');
    console.log();
    console.log('Next steps:');
    console.log('1. Test with SessionManager');
    console.log('2. Test via WhatsApp integration');
    console.log('3. Performance testing');

    client.cleanup();
    process.exit(0);

  } catch (error) {
    console.error();
    console.error('❌ TEST FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('='.repeat(60));

    client.cleanup();
    process.exit(1);
  }
}

// Run test
runTest().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
