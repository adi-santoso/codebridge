/**
 * Test 3: One-Shot Command Test
 *
 * Goal: Test spawning Claude with a single command (like in GitHub #771)
 * Expected: May hang based on the issue report
 */

import { spawn } from 'child_process';

console.log('🧪 Test 3: One-Shot Command Test\n');

const testDir = 'D:/working/gatrion/codebridge/tests/test-project';

console.log('Spawning Claude with one-shot command...\n');

const claude = spawn('claude', [
  '-p',
  '--dangerously-skip-permissions',
  '--output-format', 'stream-json',
  'list the files in this directory'
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

  if (receivedOutput && code === 0) {
    console.log('\n✅ SUCCESS: One-shot command works!');
    console.log('This is unexpected but good - maybe issue #771 is fixed?');
  } else {
    console.log('\n❌ FAILED: One-shot command did not work');
    console.log('Matches GitHub #771 behavior');
  }

  process.exit(code);
});

// Timeout after 30 seconds (one-shot might take longer)
setTimeout(() => {
  console.log('\n⏰ TIMEOUT: No response after 30 seconds');
  console.log('❌ Confirmed: One-shot command hangs in Node.js');
  console.log('This matches GitHub issue #771 exactly');
  claude.kill('SIGTERM');

  setTimeout(() => {
    console.log('Force killing...');
    claude.kill('SIGKILL');
    process.exit(1);
  }, 2000);
}, 30000);
