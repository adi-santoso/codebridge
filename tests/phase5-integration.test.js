/**
 * Phase 5 Integration Test
 *
 * Tests end-to-end flow:
 * 1. Session creation
 * 2. Project selection
 * 3. Multiple sessions per user
 * 4. Tool execution (Bash, Read, Write, Edit)
 * 5. Multi-turn conversation
 * 6. Session persistence
 */

import { SessionManager } from '../src/claude/session-manager.js';
import { SessionDatabase } from '../src/database/session-db.js';
import { ToolExecutor } from '../src/tools/executor.js';
import { CommandParser } from '../src/commands/parser.js';
import { SessionCommands } from '../src/commands/session-commands.js';
import { MessageHandler } from '../src/whatsapp/message-handler.js';
import { Logger } from '../src/utils/logger.js';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

const logger = new Logger('Phase5Test');

// Test configuration
const TEST_DB_PATH = './.codebridge/test-sessions.db';
const TEST_PROJECT_ROOT = './test-projects';
const TEST_PROJECT_NAME = 'test-project';
const TEST_PROJECT_PATH = join(TEST_PROJECT_ROOT, TEST_PROJECT_NAME);
const TEST_USER_ID = '628123456789';

// Cleanup function
function cleanup() {
  logger.info('Cleaning up test environment...');

  // Remove test database
  if (existsSync(TEST_DB_PATH)) {
    rmSync(TEST_DB_PATH, { force: true });
  }

  // Remove test projects
  if (existsSync(TEST_PROJECT_ROOT)) {
    rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
  }

  logger.success('Cleanup complete');
}

// Setup test environment
function setupTestEnvironment() {
  logger.info('Setting up test environment...');

  // Create test project directory
  if (!existsSync(TEST_PROJECT_ROOT)) {
    mkdirSync(TEST_PROJECT_ROOT, { recursive: true });
  }

  if (!existsSync(TEST_PROJECT_PATH)) {
    mkdirSync(TEST_PROJECT_PATH, { recursive: true });
  }

  logger.success('Test environment ready');
}

// Test 1: Database Operations
async function testDatabase() {
  logger.info('\n=== Test 1: Database Operations ===');

  const db = new SessionDatabase({ path: TEST_DB_PATH });

  try {
    // Generate session ID
    const sessionId = db.generateSessionId();
    logger.info(`Generated session ID: ${sessionId}`);
    assert(sessionId.startsWith('sess_'), 'Session ID should start with sess_');

    // Create session
    const session = db.createSession(TEST_USER_ID, sessionId);
    logger.info('Session created:', session);
    assert(session.userId === TEST_USER_ID, 'User ID should match');
    assert(session.state === 'SESSION_SELECTED', 'State should be SESSION_SELECTED');

    // Get session by ID
    const retrieved = db.getSessionById(sessionId);
    assert(retrieved !== null, 'Session should exist');
    assert(retrieved.sessionId === sessionId, 'Session IDs should match');

    // Set project
    db.setSessionProject(sessionId, TEST_PROJECT_PATH);
    const updated = db.getSessionById(sessionId);
    assert(updated.state === 'PROJECT_SELECTED', 'State should be PROJECT_SELECTED');
    assert(updated.projectPath === TEST_PROJECT_PATH, 'Project path should match');

    // Touch session
    const before = updated.lastActive;
    await new Promise(resolve => setTimeout(resolve, 100));
    db.touchSession(sessionId);
    const touched = db.getSessionById(sessionId);
    assert(touched.lastActive > before, 'Last active should be updated');

    // Get user sessions
    const sessions = db.getUserSessions(TEST_USER_ID);
    assert(sessions.length === 1, 'Should have 1 session');

    logger.success('✅ Database operations test passed');

    db.close();
  } catch (error) {
    logger.error('❌ Database test failed:', error.message);
    db.close();
    throw error;
  }
}

// Test 2: Tool Executor
async function testToolExecutor() {
  logger.info('\n=== Test 2: Tool Executor ===');

  const executor = new ToolExecutor({ projectPath: TEST_PROJECT_PATH });

  try {
    // Test Bash
    logger.info('Testing Bash tool...');
    const bashResult = await executor.executeBash({
      command: 'echo "Hello from test"'
    });
    assert(!bashResult.isError, 'Bash should succeed');
    assert(bashResult.content.includes('Hello from test'), 'Should contain output');
    logger.info('Bash result:', bashResult);

    // Test Write
    logger.info('Testing Write tool...');
    const writeResult = await executor.executeWrite({
      file_path: 'test.txt',
      content: 'Test content'
    });
    assert(!writeResult.isError, 'Write should succeed');
    logger.info('Write result:', writeResult);

    // Test Read
    logger.info('Testing Read tool...');
    const readResult = await executor.executeRead({
      file_path: 'test.txt'
    });
    assert(!readResult.isError, 'Read should succeed');
    assert(readResult.content.includes('Test content'), 'Should read content');
    logger.info('Read result:', readResult);

    // Test Edit
    logger.info('Testing Edit tool...');
    const editResult = await executor.executeEdit({
      file_path: 'test.txt',
      old_string: 'Test',
      new_string: 'Modified'
    });
    assert(!editResult.isError, 'Edit should succeed');
    logger.info('Edit result:', editResult);

    // Verify edit
    const verifyResult = await executor.executeRead({
      file_path: 'test.txt'
    });
    assert(verifyResult.content.includes('Modified'), 'Should have modified content');

    logger.success('✅ Tool executor test passed');

  } catch (error) {
    logger.error('❌ Tool executor test failed:', error.message);
    throw error;
  }
}

// Test 3: Command Parser
function testCommandParser() {
  logger.info('\n=== Test 3: Command Parser ===');

  try {
    // Test isCommand
    assert(CommandParser.isCommand('/newsession'), 'Should detect command');
    assert(!CommandParser.isCommand('hello world'), 'Should not detect non-command');

    // Test parse
    const parsed = CommandParser.parse('/project myproject');
    assert(parsed.command === 'project', 'Command should be project');
    assert(parsed.args[0] === 'myproject', 'Args should be parsed');
    assert(parsed.rawArgs === 'myproject', 'RawArgs should be preserved');

    // Test validate
    const valid = CommandParser.validate('newsession', []);
    assert(valid.valid, 'newsession should be valid with no args');

    const invalid = CommandParser.validate('project', []);
    assert(!invalid.valid, 'project should be invalid without args');
    assert(invalid.error.includes('Missing project name'), 'Should have error message');

    logger.success('✅ Command parser test passed');

  } catch (error) {
    logger.error('❌ Command parser test failed:', error.message);
    throw error;
  }
}

// Test 4: Session Commands
async function testSessionCommands() {
  logger.info('\n=== Test 4: Session Commands ===');

  // Cleanup and setup
  if (existsSync(TEST_DB_PATH)) {
    rmSync(TEST_DB_PATH, { force: true });
  }

  const sessionManager = new SessionManager({ dbPath: TEST_DB_PATH });
  const sessionCommands = new SessionCommands({
    sessionManager,
    projectRootPath: TEST_PROJECT_ROOT
  });

  try {
    // Test /newsession
    logger.info('Testing /newsession...');
    const newSessionResponse = await sessionCommands.execute(TEST_USER_ID, '/newsession');
    logger.info('Response:', newSessionResponse);
    assert(newSessionResponse.includes('New session created'), 'Should create session');
    assert(newSessionResponse.includes('sess_'), 'Should include session ID');

    // Test /sessions
    logger.info('Testing /sessions...');
    const sessionsResponse = await sessionCommands.execute(TEST_USER_ID, '/sessions');
    logger.info('Response:', sessionsResponse);
    assert(sessionsResponse.includes('Your sessions'), 'Should list sessions');

    // Test /projects
    logger.info('Testing /projects...');
    const projectsResponse = await sessionCommands.execute(TEST_USER_ID, '/projects');
    logger.info('Response:', projectsResponse);
    assert(projectsResponse.includes(TEST_PROJECT_NAME), 'Should list test project');

    // Test /project
    logger.info('Testing /project...');
    const projectResponse = await sessionCommands.execute(TEST_USER_ID, `/project ${TEST_PROJECT_NAME}`);
    logger.info('Response:', projectResponse);
    assert(projectResponse.includes('Project selected'), 'Should select project');

    // Test /status
    logger.info('Testing /status...');
    const statusResponse = await sessionCommands.execute(TEST_USER_ID, '/status');
    logger.info('Response:', statusResponse);
    assert(statusResponse.includes('Ready to code'), 'Should show ready to code');

    // Test /help
    logger.info('Testing /help...');
    const helpResponse = await sessionCommands.execute(TEST_USER_ID, '/help');
    logger.info('Response:', helpResponse);
    assert(helpResponse.includes('Available Commands'), 'Should show help');

    logger.success('✅ Session commands test passed');

    await sessionManager.shutdown();
  } catch (error) {
    logger.error('❌ Session commands test failed:', error.message);
    await sessionManager.shutdown();
    throw error;
  }
}

// Test 5: Message Handler
async function testMessageHandler() {
  logger.info('\n=== Test 5: Message Handler ===');

  // Cleanup and setup
  if (existsSync(TEST_DB_PATH)) {
    rmSync(TEST_DB_PATH, { force: true });
  }

  const sessionManager = new SessionManager({ dbPath: TEST_DB_PATH });
  const messageHandler = new MessageHandler({
    sessionManager,
    projectRootPath: TEST_PROJECT_ROOT
  });

  try {
    // Test command routing
    logger.info('Testing command routing...');
    const cmdResult = await messageHandler.handleMessage({
      userId: TEST_USER_ID,
      message: '/newsession'
    });
    logger.info('Command result:', cmdResult);
    assert(!cmdResult.isError, 'Command should succeed');
    assert(cmdResult.isCommand, 'Should be marked as command');
    assert(cmdResult.response.includes('New session created'), 'Should create session');

    // Test prompt without project (should fail)
    logger.info('Testing prompt without project...');
    const noProjectResult = await messageHandler.handleMessage({
      userId: TEST_USER_ID,
      message: 'list files'
    });
    logger.info('No project result:', noProjectResult);
    assert(noProjectResult.isError, 'Should error without project');
    assert(noProjectResult.response.includes('No project selected'), 'Should say no project');

    // Select project
    logger.info('Selecting project...');
    await messageHandler.handleMessage({
      userId: TEST_USER_ID,
      message: `/project ${TEST_PROJECT_NAME}`
    });

    // Test prompt with project (would require Claude CLI - skip for unit test)
    logger.info('Prompt with project would require Claude CLI - skipping');

    logger.success('✅ Message handler test passed');

    await sessionManager.shutdown();
  } catch (error) {
    logger.error('❌ Message handler test failed:', error.message);
    await sessionManager.shutdown();
    throw error;
  }
}

// Test 6: Multiple Sessions
async function testMultipleSessions() {
  logger.info('\n=== Test 6: Multiple Sessions ===');

  // Cleanup and setup
  if (existsSync(TEST_DB_PATH)) {
    rmSync(TEST_DB_PATH, { force: true });
  }

  const sessionManager = new SessionManager({ dbPath: TEST_DB_PATH });

  try {
    // Create first session
    const session1 = sessionManager.createSession(TEST_USER_ID);
    logger.info('Session 1 created:', session1.sessionId);

    // Create second session
    const session2 = sessionManager.createSession(TEST_USER_ID);
    logger.info('Session 2 created:', session2.sessionId);

    // Verify active session is session2 (most recent)
    const active = sessionManager.getActiveSession(TEST_USER_ID);
    assert(active.sessionId === session2.sessionId, 'Active should be session2');

    // Switch to session1
    sessionManager.switchSession(TEST_USER_ID, session1.sessionId);
    const switched = sessionManager.getActiveSession(TEST_USER_ID);
    assert(switched.sessionId === session1.sessionId, 'Active should be session1 after switch');

    // Get all sessions
    const allSessions = sessionManager.getUserSessions(TEST_USER_ID);
    assert(allSessions.length === 2, 'Should have 2 sessions');

    logger.success('✅ Multiple sessions test passed');

    await sessionManager.shutdown();
  } catch (error) {
    logger.error('❌ Multiple sessions test failed:', error.message);
    await sessionManager.shutdown();
    throw error;
  }
}

// Helper assertion function
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Main test runner
async function runTests() {
  logger.info('🧪 Starting Phase 5 Integration Tests\n');

  try {
    // Setup
    cleanup();
    setupTestEnvironment();

    // Run tests
    await testDatabase();
    await testToolExecutor();
    testCommandParser();
    await testSessionCommands();
    await testMessageHandler();
    await testMultipleSessions();

    // Cleanup
    cleanup();

    logger.success('\n✅ All tests passed!');
    process.exit(0);

  } catch (error) {
    logger.error('\n❌ Test suite failed:', error);
    cleanup();
    process.exit(1);
  }
}

// Run if main module
runTests();
