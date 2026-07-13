/**
 * Socket.IO Server Test
 * Tests basic server functionality, authentication, and event handling
 */

import { io } from 'socket.io-client';
import { socketConfig } from '../src/config/socket-config.js';

const SERVER_URL = `http://localhost:${socketConfig.port}`;
const AUTH_KEY = socketConfig.authKey;

// Test utilities
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const log = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  test: (msg) => console.log(`\n🧪 ${msg}`)
};

// Test suite
class ServerTest {
  constructor() {
    this.socket = null;
    this.testResults = [];
  }

  /**
   * Test 1: Server Connection
   */
  async testConnection() {
    log.test('Test 1: Server Connection');

    return new Promise((resolve, reject) => {
      this.socket = io(SERVER_URL, {
        transports: ['websocket'],
        reconnection: false
      });

      const timeout = setTimeout(() => {
        this.socket.close();
        reject(new Error('Connection timeout'));
      }, 5000);

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        log.success(`Connected to server (ID: ${this.socket.id})`);
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Test 2: Authentication
   */
  async testAuthentication() {
    log.test('Test 2: Authentication');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Authentication timeout'));
      }, 5000);

      this.socket.once('auth:success', (data) => {
        clearTimeout(timeout);
        log.success(`Authentication successful`);
        log.info(`Client ID: ${data.clientId}`);
        log.info(`Server time: ${new Date(data.serverTime).toISOString()}`);
        resolve(data);
      });

      this.socket.once('auth:error', (data) => {
        clearTimeout(timeout);
        reject(new Error(`Authentication failed: ${data.message}`));
      });

      // Send authentication
      this.socket.emit('authenticate', {
        authKey: AUTH_KEY,
        metadata: {
          platform: 'test-suite',
          version: '1.0.0'
        }
      });
    });
  }

  /**
   * Test 3: Health Check
   */
  async testHealthCheck() {
    log.test('Test 3: Health Check');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Health check timeout'));
      }, 10000);

      this.socket.once('codebridge:health', (data) => {
        clearTimeout(timeout);
        log.success('Health check passed');
        log.info(`Status: ${data.status}`);
        log.info(`Kreova: ${data.kreova.status}`);
        log.info(`Active connections: ${data.connections}`);
        resolve(data);
      });

      this.socket.once('codebridge:error', (data) => {
        clearTimeout(timeout);
        reject(new Error(`Health check failed: ${data.message}`));
      });

      this.socket.emit('codebridge:health');
    });
  }

  /**
   * Test 4: Send Message
   */
  async testSendMessage() {
    log.test('Test 4: Send Message');

    const testSession = 'test-session-' + Date.now();
    const testMessage = 'Hello, what is 2+2?';

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Message timeout'));
      }, 35000); // 35 seconds for AI response

      this.socket.once('codebridge:response', (data) => {
        clearTimeout(timeout);
        log.success('Message processed successfully');
        log.info(`Session: ${data.sessionId}`);
        log.info(`Duration: ${data.duration}ms`);
        log.info(`Response length: ${data.response.length} chars`);
        log.info(`Conversation length: ${data.metadata.conversationLength} messages`);
        log.info(`Response preview: ${data.response.substring(0, 100)}...`);
        resolve(data);
      });

      this.socket.once('codebridge:error', (data) => {
        clearTimeout(timeout);
        reject(new Error(`Message failed: ${data.message}`));
      });

      log.info(`Sending message to session: ${testSession}`);
      this.socket.emit('codebridge:message', {
        sessionId: testSession,
        message: testMessage,
        metadata: {
          platform: 'test-suite'
        }
      });
    });
  }

  /**
   * Test 5: Get Status
   */
  async testGetStatus() {
    log.test('Test 5: Get Status');

    const testSession = 'test-session-' + Date.now();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Status timeout'));
      }, 5000);

      this.socket.once('codebridge:status', (data) => {
        clearTimeout(timeout);
        log.success('Status retrieved successfully');
        log.info(`Session: ${data.sessionId}`);
        log.info(`History length: ${data.status.historyLength}`);
        log.info(`Has history: ${data.status.hasHistory}`);
        resolve(data);
      });

      this.socket.once('codebridge:error', (data) => {
        clearTimeout(timeout);
        reject(new Error(`Status failed: ${data.message}`));
      });

      this.socket.emit('codebridge:status', {
        sessionId: testSession
      });
    });
  }

  /**
   * Test 6: Clear Conversation
   */
  async testClearConversation() {
    log.test('Test 6: Clear Conversation');

    const testSession = 'test-session-' + Date.now();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Clear timeout'));
      }, 5000);

      this.socket.once('codebridge:cleared', (data) => {
        clearTimeout(timeout);
        log.success('Conversation cleared successfully');
        log.info(`Session: ${data.sessionId}`);
        resolve(data);
      });

      this.socket.once('codebridge:error', (data) => {
        clearTimeout(timeout);
        reject(new Error(`Clear failed: ${data.message}`));
      });

      this.socket.emit('codebridge:clear', {
        sessionId: testSession
      });
    });
  }

  /**
   * Test 7: Rate Limiting
   */
  async testRateLimit() {
    log.test('Test 7: Rate Limiting');

    const testSession = 'test-session-ratelimit-' + Date.now();
    const maxRequests = socketConfig.rateLimit.maxRequests;

    log.info(`Sending ${maxRequests + 1} requests rapidly...`);

    let errorReceived = false;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (errorReceived) {
          resolve();
        } else {
          reject(new Error('Rate limit not triggered'));
        }
      }, 10000);

      this.socket.on('codebridge:error', (data) => {
        if (data.code === 'RATE_LIMIT_EXCEEDED') {
          clearTimeout(timeout);
          errorReceived = true;
          log.success('Rate limit triggered correctly');
          log.info(`Error message: ${data.message}`);
          resolve();
        }
      });

      // Send maxRequests + 1 messages
      for (let i = 0; i <= maxRequests; i++) {
        this.socket.emit('codebridge:message', {
          sessionId: testSession,
          message: `Test message ${i}`
        });
      }
    });
  }

  /**
   * Cleanup
   */
  cleanup() {
    if (this.socket) {
      this.socket.close();
      log.info('Socket connection closed');
    }
  }

  /**
   * Run all tests
   */
  async runAll() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('       CodeBridge Socket.IO Server Test Suite');
    console.log('═══════════════════════════════════════════════════════\n');

    const tests = [
      { name: 'Connection', fn: () => this.testConnection() },
      { name: 'Authentication', fn: () => this.testAuthentication() },
      { name: 'Health Check', fn: () => this.testHealthCheck() },
      { name: 'Send Message', fn: () => this.testSendMessage() },
      { name: 'Get Status', fn: () => this.testGetStatus() },
      { name: 'Clear Conversation', fn: () => this.testClearConversation() },
      { name: 'Rate Limiting', fn: () => this.testRateLimit() }
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      try {
        await test.fn();
        this.testResults.push({ name: test.name, status: 'PASSED' });
        passed++;
        await sleep(1000); // Wait between tests
      } catch (error) {
        log.error(`${test.name} failed: ${error.message}`);
        this.testResults.push({ name: test.name, status: 'FAILED', error: error.message });
        failed++;
      }
    }

    // Print summary
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('                     Test Summary');
    console.log('═══════════════════════════════════════════════════════\n');

    this.testResults.forEach(result => {
      const icon = result.status === 'PASSED' ? '✅' : '❌';
      console.log(`${icon} ${result.name}: ${result.status}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    console.log(`\nTotal: ${tests.length} | Passed: ${passed} | Failed: ${failed}\n`);

    this.cleanup();

    return failed === 0;
  }
}

// Run tests
async function main() {
  const tester = new ServerTest();

  try {
    const success = await tester.runAll();
    process.exit(success ? 0 : 1);
  } catch (error) {
    log.error(`Test suite failed: ${error.message}`);
    tester.cleanup();
    process.exit(1);
  }
}

main();
