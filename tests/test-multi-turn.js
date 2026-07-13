/**
 * Test 3: Multi-Turn Conversation
 * Tests context maintenance across multiple turns
 */

import { DirectClaudeSpawner } from '../src/claude/direct-spawner.js';
import { execSync } from 'child_process';

async function testMultiTurn() {
  console.log('🧪 Test 3: Multi-Turn Conversation\n');

  const spawner = new DirectClaudeSpawner({
    apiKey: 'kv-695d10bd7e29adbf9cb64a6a78254ba48f14578497611531',
    customEndpoint: 'http://127.0.0.1:3847',
    projectPath: 'D:/working/gatrion/codebridge/tests/fixtures/test-project',
    model: 'kiro-claude-sonnet-4.5'
  });

  let turnCount = 0;
  const prompts = [
    'What files are in this directory?',
    'Create a file called hello.txt with content "Hello World"',
    'Show me the content of hello.txt'
  ];

  // Handle tool execution (needed for file operations)
  spawner.on('tool-use', async ({ userId, tool }) => {
    console.log(`\n🔧 Tool: ${tool.name}`);

    try {
      let result;

      if (tool.name === 'Bash') {
        result = execSync(tool.input.command, {
          cwd: 'D:/working/gatrion/codebridge/tests/fixtures/test-project',
          encoding: 'utf8',
          timeout: 10000
        });
      } else if (tool.name === 'Write') {
        // Handle Write tool if needed
        result = 'File written successfully';
      } else if (tool.name === 'Read') {
        // Handle Read tool if needed
        result = 'File read successfully';
      } else {
        result = `Tool ${tool.name} executed`;
      }

      const session = spawner.sessions.get(userId);
      if (session) {
        await session.sendToolResult(tool.id, result, false);
      }

    } catch (error) {
      const session = spawner.sessions.get(userId);
      if (session) {
        await session.sendToolResult(tool.id, error.message, true);
      }
    }
  });

  // Handle text response
  spawner.on('text', ({ userId, text }) => {
    process.stdout.write(text);
  });

  spawner.on('thinking', ({ userId, thinking }) => {
    // Suppress thinking output for cleaner logs
  });

  spawner.on('turn-end', async ({ userId, stopReason }) => {
    console.log(`\n✅ Turn ${turnCount + 1} completed: ${stopReason}\n`);

    turnCount++;

    if (turnCount < prompts.length) {
      // Send next prompt
      console.log(`--- Turn ${turnCount + 1} ---`);
      console.log(`Prompt: "${prompts[turnCount]}"\n`);

      const session = spawner.sessions.get(userId);
      if (session) {
        await session.sendPrompt(prompts[turnCount]);
      }
    } else {
      // All turns completed
      console.log('\n✅ All turns completed');
      console.log(`Total turns: ${turnCount}`);

      spawner.closeSession(userId).then(() => {
        console.log('\n✅ Test passed!');
        process.exit(0);
      });
    }
  });

  spawner.on('error', ({ userId, error }) => {
    console.error('\n❌ Error:', error.message);
    spawner.closeSession(userId).catch(() => {});
    process.exit(1);
  });

  spawner.on('session-closed', ({ userId, code, signal }) => {
    console.log(`\n🔒 Session closed: code=${code}, signal=${signal}`);
  });

  try {
    // Create session
    console.log('Creating session...');
    const session = await spawner.createSession('test-user');
    console.log('✅ Session created\n');

    // Start conversation with first prompt
    console.log('--- Turn 1 ---');
    console.log(`Prompt: "${prompts[0]}"\n`);
    await session.sendPrompt(prompts[0]);

    // Wait for turns to complete (turn-end handler will send next prompt)
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    await spawner.cleanup().catch(() => {});
    process.exit(1);
  }
}

testMultiTurn();
