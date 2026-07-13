/**
 * Test System Prompt Injection
 *
 * Test apakah Claude Code CLI mendukung system message via stdin
 * untuk inject formatting instructions
 */

import { spawn } from 'child_process';
import { resolve } from 'path';

const TEST_PROJECT_PATH = 'D:/working/gatrion/codebridge';

console.log('=== System Prompt Injection Test ===\n');

async function testSystemPrompt() {
  console.log('1. Spawning Claude CLI...');

  const child = spawn('claude', [
    '--print',
    '--input-format=stream-json',
    '--output-format=stream-json',
    '--verbose',
    '--dangerously-skip-permissions'
  ], {
    cwd: TEST_PROJECT_PATH,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false
  });

  let outputBuffer = '';
  let errorOccurred = false;

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    outputBuffer += chunk;
    console.log('[STDOUT]', chunk);
  });

  child.stderr.on('data', (data) => {
    console.error('[STDERR]', data.toString());
    if (data.toString().includes('error') || data.toString().includes('Error')) {
      errorOccurred = true;
    }
  });

  child.on('error', (error) => {
    console.error('[SPAWN ERROR]', error.message);
    errorOccurred = true;
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n2. Sending SYSTEM message...');

  const systemMessage = {
    type: 'system',
    message: {
      role: 'system',
      content: [{
        type: 'text',
        text: `You are a coding assistant for WhatsApp interface.

RESPONSE FORMAT RULES:
- Use WhatsApp markdown: *bold*, _italic_, \`code\`
- Keep responses under 500 characters for this test
- Start your response with "📱 WhatsApp Mode:" to confirm you received this instruction
- Use bullet points (•) for lists
- Use emojis for visual hierarchy

Test instruction: Keep your next response VERY SHORT.`
      }]
    }
  };

  child.stdin.write(JSON.stringify(systemMessage) + '\n');
  console.log('System message sent:', JSON.stringify(systemMessage, null, 2));

  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n3. Sending USER message...');

  const userMessage = {
    type: 'user',
    message: {
      role: 'user',
      content: [{
        type: 'text',
        text: 'List 3 files in this project'
      }]
    }
  };

  child.stdin.write(JSON.stringify(userMessage) + '\n');
  console.log('User message sent');

  // Wait for response
  await new Promise(resolve => setTimeout(resolve, 15000));

  console.log('\n4. Checking response...');

  if (errorOccurred) {
    console.log('\n❌ RESULT: System message caused ERROR');
    console.log('Claude Code CLI likely does NOT support system messages via stdin');
  } else if (outputBuffer.includes('📱 WhatsApp Mode:')) {
    console.log('\n✅ RESULT: System prompt WORKS!');
    console.log('Claude acknowledged the system instruction');
  } else if (outputBuffer.includes('text_delta')) {
    console.log('\n⚠️  RESULT: System prompt might work, but not confirmed');
    console.log('Claude responded but did not explicitly acknowledge system instruction');
    console.log('Could be that Claude ignored system message or reformatted response differently');
  } else {
    console.log('\n❓ RESULT: Unclear - no readable response received');
  }

  console.log('\n5. Full output buffer:');
  console.log('---');
  console.log(outputBuffer);
  console.log('---');

  // Cleanup
  child.kill('SIGTERM');

  setTimeout(() => {
    if (!child.killed) {
      child.kill('SIGKILL');
    }
    process.exit(0);
  }, 2000);
}

// Run test
testSystemPrompt().catch(error => {
  console.error('\n❌ Test failed:', error.message);
  process.exit(1);
});
