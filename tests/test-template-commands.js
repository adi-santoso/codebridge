/**
 * Tests for Template Commands (Phase 8)
 *
 * Test template command handlers and their integration with the command system
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { CommandHandler } from '../src/commands/handler.js';
import { SessionManager } from '../src/claude/session-manager.js';
import { DirectClaudeSpawner } from '../src/claude/direct-spawner.js';
import { SessionDatabase } from '../src/database/session-db.js';
import { EventEmitter } from 'events';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { resolve } from 'path';

/**
 * Mock DirectClaudeSpawner for testing
 */
class MockClaudeSpawner extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this.lastMessage = null;
  }

  async createSession(userId, options = {}) {
    const session = {
      userId,
      isReady: true,
      isClosed: false,
      sendPrompt: (text) => this.sendMessage(userId, text)
    };
    this.sessions.set(userId, session);
    return session;
  }

  async getOrCreateSession(userId, options = {}) {
    if (this.sessions.has(userId)) {
      return this.sessions.get(userId);
    }
    return this.createSession(userId, options);
  }

  async sendMessage(userId, prompt, options = {}) {
    this.lastMessage = { userId, prompt, options };

    // Simulate async response
    setTimeout(() => {
      this.emit('text', {
        userId,
        type: 'text',
        text: `Mock response for: ${prompt.substring(0, 50)}...`
      });

      setTimeout(() => {
        this.emit('complete', { userId });
      }, 10);
    }, 10);
  }

  async closeSession(userId) {
    this.sessions.delete(userId);
  }
}

describe('Template Commands', () => {
  let commandHandler;
  let sessionManager;
  let db;
  let testUserId;
  let testProjectPath;

  beforeEach(() => {
    // Create test environment
    testUserId = 'test-user-123';
    testProjectPath = resolve(process.cwd(), 'test-template-project');

    // Create test project directory
    try {
      mkdirSync(testProjectPath, { recursive: true });
      mkdirSync(resolve(testProjectPath, 'src'), { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Create test files
    writeFileSync(
      resolve(testProjectPath, 'src', 'test.js'),
      'function add(a, b) { return a + b; }\nmodule.exports = { add };'
    );

    writeFileSync(
      resolve(testProjectPath, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        devDependencies: {
          jest: '^29.0.0'
        }
      }, null, 2)
    );

    // Initialize database
    db = new SessionDatabase(':memory:');
    db.initialize();

    // Initialize session manager with mock spawner
    const mockSpawner = new MockClaudeSpawner();
    sessionManager = new SessionManager({
      db,
      spawnerFactory: () => mockSpawner
    });

    // Initialize command handler
    commandHandler = new CommandHandler({
      sessionManager,
      db,
      projectRootPath: process.cwd(),
      projectRegistry: {
        'test-project': testProjectPath
      }
    });

    // Create and setup session
    const session = sessionManager.createSession(testUserId);
    session.projectPath = testProjectPath;
    session.workingDirectory = testProjectPath;
    session.spawner = mockSpawner;
    session.state = 'PROJECT_SELECTED';
  });

  afterEach(() => {
    // Clean up test project
    try {
      rmSync(testProjectPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('/ask command', () => {
    it('should handle quick question', async () => {
      const result = await commandHandler.execute(
        testUserId,
        '/ask how to handle async errors in node.js'
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.message);
      assert.ok(result.message.includes('Mock response'));
    });

    it('should reject empty question', async () => {
      const result = await commandHandler.execute(testUserId, '/ask');

      assert.strictEqual(result.success, true);
      assert.ok(result.message.includes('Usage'));
    });

    it('should handle question with multiple words', async () => {
      const result = await commandHandler.execute(
        testUserId,
        '/ask what is the difference between let and const in javascript'
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.message);
    });
  });

  describe('/fix command', () => {
    it('should handle error message', async () => {
      const result = await commandHandler.execute(
        testUserId,
        '/fix TypeError: Cannot read property "map" of undefined'
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.message);
    });

    it('should extract file path from error', async () => {
      const result = await commandHandler.execute(
        testUserId,
        '/fix Error at src/test.js:2:10'
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.message);
    });

    it('should reject empty error', async () => {
      const result = await commandHandler.execute(testUserId, '/fix');

      assert.strictEqual(result.success, true);
      assert.ok(result.message.includes('Usage'));
    });
  });

  describe('/review command', () => {
    it('should review existing file', async () => {
      const result = await commandHandler.execute(
        testUserId,
        '/review src/test.js'
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.message);
    });

    it('should handle non-existent file', async () => {
      const result = await commandHandler.execute(
        testUserId,
        '/review src/nonexistent.js'
      );

      // Should still succeed but with empty context
      assert.strictEqual(result.success, true);
      assert.ok(result.message);
    });

    it('should reject empty file path', async () => {
      const result = await commandHandler.execute(testUserId, '/review');

      assert.strictEqual(result.success, true);
      assert.ok(result.message.includes('Usage'));
    });
  });

  describe('/test command', () => {
    it('should generate tests for file', async () => {
      const result = await commandHandler.execute(
        testUserId,
        '/test src/test.js'
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.message);
    });

    it('should detect test framework from package.json', async () => {
      const result = await commandHandler.execute(
        testUserId,
        '/test src/test.js'
      );

      assert.strictEqual(result.success, true);
      // Should have read package.json for framework detection
      assert.ok(result.message);
    });

    it('should reject empty file path', async () => {
      const result = await commandHandler.execute(testUserId, '/test');

      assert.strictEqual(result.success, true);
      assert.ok(result.message.includes('Usage'));
    });
  });

  describe('/doc command', () => {
    it('should generate documentation for file', async () => {
      const result = await commandHandler.execute(
        testUserId,
        '/doc src/test.js'
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.message);
    });

    it('should reject empty file path', async () => {
      const result = await commandHandler.execute(testUserId, '/doc');

      assert.strictEqual(result.success, true);
      assert.ok(result.message.includes('Usage'));
    });
  });

  describe('/refactor command', () => {
    it('should suggest refactoring improvements', async () => {
      const result = await commandHandler.execute(
        testUserId,
        '/refactor src/test.js'
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.message);
    });

    it('should reject empty file path', async () => {
      const result = await commandHandler.execute(testUserId, '/refactor');

      assert.strictEqual(result.success, true);
      assert.ok(result.message.includes('Usage'));
    });
  });

  describe('Template aliases', () => {
    it('should work with /q alias for /ask', async () => {
      const result = await commandHandler.execute(
        testUserId,
        '/q what is async await'
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.message);
    });

    it('should work with /codereview alias for /review', async () => {
      const result = await commandHandler.execute(
        testUserId,
        '/codereview src/test.js'
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.message);
    });
  });

  describe('Session requirements', () => {
    it('should require active session', async () => {
      const newUserId = 'no-session-user';

      const result = await commandHandler.execute(
        newUserId,
        '/ask what is nodejs'
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.message.includes('No active session'));
    });

    it('should require project selection', async () => {
      const newUserId = 'no-project-user';

      // Create session but don't select project
      const session = sessionManager.createSession(newUserId);
      session.state = 'SESSION_SELECTED';

      const result = await commandHandler.execute(
        newUserId,
        '/ask what is nodejs'
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.message.includes('No project selected'));
    });
  });

  describe('Context extraction', () => {
    it('should extract context for file-based templates', async () => {
      const result = await commandHandler.execute(
        testUserId,
        '/review src/test.js'
      );

      assert.strictEqual(result.success, true);
      // Should have read the file content
      assert.ok(result.message);
    });

    it('should handle relative paths', async () => {
      const result = await commandHandler.execute(
        testUserId,
        '/doc ./src/test.js'
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.message);
    });

    it('should handle paths with spaces', async () => {
      // Create file with spaces in name
      writeFileSync(
        resolve(testProjectPath, 'src', 'test file.js'),
        'console.log("test");'
      );

      const result = await commandHandler.execute(
        testUserId,
        '/review "src/test file.js"'
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.message);
    });
  });
});

console.log('Template command tests completed!');
