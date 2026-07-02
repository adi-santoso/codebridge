/**
 * Test 2: Interactive Mode Spawn Test
 *
 * Goal: Test spawning Claude with --interactive flag (potential workaround)
 * Expected: Should spawn and respond to stdin commands
 */

import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

console.log('🧪 Test 2: Interactive Mode Spawn\n');

// Create test directory
import { mkdirSync, existsSync } from 'fs';
const testDir = 'D:/working/gatrion/codebridge/tests/test-project';
if (!existsSync(testDir)) {
  mkdirSync(testDir, { recursive: true });
  console.log(`✅ Created test directory: ${testDir}`);
}

console.log('Spawning Claude in interactive mode...\n');

const claude = spawn('claude', [
  '--dangerously-skip-permissions',
  '--output-format', 'stream-json'
], {
  cwd: testDir,
  stdio: ['pipe', 'pipe', 'pipe']
});

let receivedOutput = false;
let outputBuffer = '';

claude.stdout.on('data', (data) => {
  receivedOutput = true;
  outputBuffer += data.toString();
  console.log('📤 STDOUT:', data.toString().trim());
});

claude.stderr.on('data', (data) => {
  console.log('📤 STDERR:', data.toString().trim());
});

claude.on('error', (error) => {
  console.error('❌ Spawn Error:', error.message);
  process.exit(1);
});

claude.on('close', (code) => {
  console.log('\n--- Results ---');
  console.log('Exit code:', code);
  console.log('Received output:', receivedOutput);
  console.log('Output length:', outputBuffer.length);

  if (receivedOutput) {
    console.log('\n✅ SUCCESS: Claude responded to stdin!');
    console.log('Node.js subprocess workaround is VIABLE');
  } else {
    console.log('\n❌ FAILED: No response from Claude');
    console.log('Need to use Python bridge approach');
  }

  process.exit(code);
});

// Send test command after 2 seconds
setTimeout(() => {
  console.log('\n📨 Sending test command: "echo Hello from CodeBridge test"\n');
  claude.stdin.write('echo Hello from CodeBridge test\n');
}, 2000);

// Send exit command after 5 seconds
setTimeout(() => {
  console.log('\n📨 Sending exit command...\n');
  claude.stdin.write('/exit\n');
}, 5000);

// Timeout after 15 seconds
setTimeout(() => {
  console.log('\n⏰ TIMEOUT: No response after 15 seconds');
  console.log('❌ This confirms the hanging issue - Python bridge needed');
  claude.kill('SIGTERM');

  setTimeout(() => {
    console.log('Force killing...');
    claude.kill('SIGKILL');
    process.exit(1);
  }, 2000);
}, 15000);
