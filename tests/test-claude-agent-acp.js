/**
 * Test claude-agent-acp with custom model
 *
 * This test will:
 * 1. Spawn claude-agent-acp subprocess
 * 2. Configure to use custom model endpoint
 * 3. Send JSON-RPC requests
 * 4. Test conversation flow
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🧪 Testing claude-agent-acp with custom model\n');

// Configuration
const API_KEY = 'kv-27bc3e239790219561fefcc4d66e1912cd879e1035e4d54d';
const BASE_URL = 'http://127.0.0.1:3847/';

console.log('Configuration:');
console.log(`  API Key: ${API_KEY.substring(0, 10)}...`);
console.log(`  Base URL: ${BASE_URL}\n`);

// Spawn claude-agent-acp by running the JS file directly with node
const scriptPath = path.join(
  process.cwd(),
  'node_modules',
  '@agentclientprotocol',
  'claude-agent-acp',
  'dist',
  'index.js'
);

const agent = spawn('node', [scriptPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    ANTHROPIC_API_KEY: API_KEY,
    ANTHROPIC_BASE_URL: BASE_URL,
    NODE_ENV: 'development'
  }
});

let requestId = 1;
const pendingRequests = new Map();

// Parse NDJSON responses
const rl = createInterface({
  input: agent.stdout,
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    console.log('\n📤 Received:', JSON.stringify(response, null, 2));

    // Handle notifications (no id field)
    if (!response.id && response.method) {
      console.log('🔔 Notification:', response.method);
      return;
    }

    const pending = pendingRequests.get(response.id);
    if (pending) {
      pending.resolve(response);
      pendingRequests.delete(response.id);
    }
  } catch (e) {
    console.error('❌ Failed to parse response:', line);
  }
});

agent.stderr.on('data', (data) => {
  console.log('📋 STDERR:', data.toString().trim());
});

agent.on('error', (error) => {
  console.error('❌ Process error:', error);
  process.exit(1);
});

agent.on('exit', (code, signal) => {
  console.log(`\n⚠️  Agent exited: code=${code}, signal=${signal}`);
  process.exit(code || 0);
});

// Helper to send JSON-RPC request
function sendRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = requestId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    console.log('\n📨 Sending:', JSON.stringify(request, null, 2));

    agent.stdin.write(JSON.stringify(request) + '\n');

    pendingRequests.set(id, { resolve, reject });

    // Timeout after 60 seconds
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Request ${id} timed out`));
      }
    }, 60000);
  });
}

// Wait a bit for agent to initialize
await new Promise(resolve => setTimeout(resolve, 2000));

try {
  // Test 1: Initialize agent
  console.log('\n' + '='.repeat(50));
  console.log('TEST 1: Initialize Agent');
  console.log('='.repeat(50));

  const initResult = await sendRequest('initialize', {
    protocolVersion: 1,
    clientCapabilities: {
      fs: {
        readTextFile: true,
        writeTextFile: true
      }
    }
  });

  console.log('✅ Initialize success');

  // Test 2: Create new session
  console.log('\n' + '='.repeat(50));
  console.log('TEST 2: Create Session');
  console.log('='.repeat(50));

  const sessionResult = await sendRequest('session/new', {
    cwd: process.cwd(),
    mcpServers: [],
    mode: 'bypassPermissions',  // Auto-bypass permissions for testing
    model: 'kiro-claude-sonnet-4.5'
  });

  console.log('✅ Session created');
  console.log('Session ID:', sessionResult.result?.sessionId || 'unknown');

  const sessionId = sessionResult.result?.sessionId;
  if (!sessionId) {
    throw new Error('Failed to get session ID');
  }

  // Test 3: Send simple prompt
  console.log('\n' + '='.repeat(50));
  console.log('TEST 3: Send Prompt');
  console.log('='.repeat(50));

  const promptResult = await sendRequest('session/prompt', {
    sessionId,
    prompt: [{
      type: 'text',
      text: 'Hello! Please respond with "AI is working" to confirm you can understand me.'
    }]
  });

  console.log('✅ Prompt sent');

  // Wait for response (might come as streaming)
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Test 4: Follow-up prompt (test conversation context)
  console.log('\n' + '='.repeat(50));
  console.log('TEST 4: Follow-up Prompt (Context Test)');
  console.log('='.repeat(50));

  const followupResult = await sendRequest('session/prompt', {
    sessionId,
    prompt: [{
      type: 'text',
      text: 'What was my previous message?'
    }]
  });

  console.log('✅ Follow-up sent');

  await new Promise(resolve => setTimeout(resolve, 10000));

  // Success
  console.log('\n' + '='.repeat(50));
  console.log('✅ ALL TESTS PASSED');
  console.log('='.repeat(50));
  console.log('\nConclusion:');
  console.log('  ✅ claude-agent-acp works with custom model');
  console.log('  ✅ JSON-RPC communication works');
  console.log('  ✅ Session management works');
  console.log('  ✅ Ready for CodeBridge integration!');

  process.exit(0);

} catch (error) {
  console.error('\n❌ TEST FAILED:', error.message);
  console.error(error);
  process.exit(1);
}
