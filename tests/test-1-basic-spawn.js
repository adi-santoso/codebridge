/**
 * Test 1: Basic Claude CLI Spawn Test
 *
 * Goal: Check if we can spawn 'claude' command from Node.js
 * Expected: Should spawn without errors
 */

import { spawn } from 'child_process';

console.log('🧪 Test 1: Basic Claude CLI Spawn\n');

console.log('Attempting to spawn claude command...');

const claude = spawn('claude', ['--version'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';

claude.stdout.on('data', (data) => {
  stdout += data.toString();
  console.log('📤 STDOUT:', data.toString().trim());
});

claude.stderr.on('data', (data) => {
  stderr += data.toString();
  console.log('📤 STDERR:', data.toString().trim());
});

claude.on('error', (error) => {
  console.error('❌ Spawn Error:', error.message);
  process.exit(1);
});

claude.on('close', (code) => {
  console.log('\n--- Results ---');
  console.log('Exit code:', code);
  console.log('STDOUT length:', stdout.length);
  console.log('STDERR length:', stderr.length);

  if (code === 0) {
    console.log('\n✅ SUCCESS: Claude CLI spawned successfully!');
    console.log('Version info:', stdout.trim());
  } else {
    console.log('\n❌ FAILED: Claude CLI exited with non-zero code');
  }

  process.exit(code);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('\n⏰ TIMEOUT: No response after 10 seconds');
  console.log('This suggests the hanging issue from GitHub #771');
  claude.kill();
  process.exit(1);
}, 10000);
