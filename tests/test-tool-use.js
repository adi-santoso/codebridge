/**
 * Test 2: Tool Use Flow
 * Tests tool execution (Bash command) and result sending
 */

import { DirectClaudeSpawner } from '../src/claude/direct-spawner.js';
import { execSync } from 'child_process';

async function testToolUse() {
  console.log('🧪 Test 2: Tool Use Flow\n');

  const spawner = new DirectClaudeSpawner({
    apiKey: 'kv-695d10bd7e29adbf9cb64a6a78254ba48f14578497611531',
    customEndpoint: 'http://127.0.0.1:3847',
    projectPath: 'D:/working/gatrion/codebridge/tests/fixtures/test-project',
    model: 'kiro-claude-sonnet-4.5'
  });

  let toolCount = 0;

  // Handle tool execution
  spawner.on('tool-use', async ({ userId, tool }) => {
    toolCount++;
    console.log(`\n🔧 Tool #${toolCount} requested: ${tool.name}`);
    console.log('Input:', JSON.stringify(tool.input, null, 2));

    try {
      let result;

      if (tool.name === 'Bash') {
        // Execute bash command
        result = execSync(tool.input.command, {
          cwd: 'D:/working/gatrion/codebridge/tests/fixtures/test-project',
          encoding: 'utf8',
          timeout: 10000
        });
        console.log('✅ Tool executed successfully');
        console.log('Result:', result.substring(0, 200) + (result.length > 200 ? '...' : ''));
      } else {
        result = `Tool ${tool.name} not implemented in test`;
        console.log('⚠️ Tool not implemented, sending placeholder result');
      }

      // Send tool result back to Claude
      const session = spawner.sessions.get(userId);
      if (session) {
        await session.sendToolResult(tool.id, result, false);
        console.log('✅ Tool result sent back to Claude');
      }

    } catch (error) {
      console.error('❌ Tool execution error:', error.message);

      // Send error as tool result
      const session = spawner.sessions.get(userId);
      if (session) {
        await session.sendToolResult(tool.id, error.message, true);
        console.log('✅ Error result sent back to Claude');
      }
    }
  });

  // Handle text response
  spawner.on('text', ({ userId, text }) => {
    process.stdout.write(text);
  });

  spawner.on('thinking', ({ userId, thinking }) => {
    console.log(`\n💭 [Thinking]: ${thinking}`);
  });

  spawner.on('turn-end', ({ userId, stopReason }) => {
    console.log(`\n\n✅ Turn completed: ${stopReason}`);
    console.log(`Total tools executed: ${toolCount}`);

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

  try {
    // Create session
    console.log('Creating session...');
    const session = await spawner.createSession('test-user');
    console.log('✅ Session created\n');

    // Send prompt that will trigger tool use
    console.log('Sending prompt: "list files in the current directory"\n');
    await session.sendPrompt('list files in the current directory');

    // Wait for tool execution and response
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    await spawner.cleanup().catch(() => {});
    process.exit(1);
  }
}

testToolUse();
