/**
 * Test Response Control Commands (Phase 4)
 *
 * Tests for /brief, /balanced, /detailed, /code-only, /explain-only commands
 */

import { SessionDatabase } from '../src/database/session-db.js';
import { SessionManager } from '../src/claude/session-manager.js';
import { CommandHandler } from '../src/commands/handler.js';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = './.codebridge/test-response-commands.db';
const TEST_USER_ID = '628123456789';
const TEST_PROJECT_PATH = process.cwd();

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function setup() {
  log('\n=== Setting up test environment ===', 'blue');

  // Clean up old test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
    log('✓ Removed old test database', 'green');
  }

  // Create database
  const db = new SessionDatabase({ path: TEST_DB_PATH });
  log('✓ Database initialized', 'green');

  // Create session manager
  const sessionManager = new SessionManager({ dbPath: TEST_DB_PATH });
  await sessionManager.initialize();
  log('✓ SessionManager initialized', 'green');

  // Create command handler
  const commandHandler = new CommandHandler({
    sessionManager,
    db,
    projectRootPath: TEST_PROJECT_PATH,
    projectRegistry: {
      getProjects: () => [{ name: 'test-project', path: TEST_PROJECT_PATH }]
    },
    allowedNumbers: new Set([TEST_USER_ID])
  });
  log('✓ CommandHandler initialized', 'green');

  return { db, sessionManager, commandHandler };
}

async function teardown(sessionManager, db) {
  log('\n=== Cleaning up test environment ===', 'blue');

  // Close session manager
  await sessionManager.shutdown();
  log('✓ SessionManager closed', 'green');

  // Close database
  db.close();
  log('✓ Database closed', 'green');

  // Clean up test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
    log('✓ Test database removed', 'green');
  }
}

async function testBriefMode(commandHandler) {
  log('\n--- Test 1: Set Brief Mode ---', 'yellow');

  try {
    const result = await commandHandler.execute(TEST_USER_ID, '/brief');

    if (!result.success) {
      log(`✗ FAILED: ${result.message}`, 'red');
      return false;
    }

    if (!result.message.includes('Brief') || !result.message.includes('concise')) {
      log(`✗ FAILED: Unexpected response message`, 'red');
      log(`  Message: ${result.message}`, 'red');
      return false;
    }

    log('✓ PASSED: Brief mode set successfully', 'green');
    return true;
  } catch (error) {
    log(`✗ FAILED: ${error.message}`, 'red');
    return false;
  }
}

async function testBalancedMode(commandHandler) {
  log('\n--- Test 2: Set Balanced Mode ---', 'yellow');

  try {
    const result = await commandHandler.execute(TEST_USER_ID, '/balanced');

    if (!result.success) {
      log(`✗ FAILED: ${result.message}`, 'red');
      return false;
    }

    if (!result.message.includes('Balanced') || !result.message.includes('default')) {
      log(`✗ FAILED: Unexpected response message`, 'red');
      log(`  Message: ${result.message}`, 'red');
      return false;
    }

    log('✓ PASSED: Balanced mode set successfully', 'green');
    return true;
  } catch (error) {
    log(`✗ FAILED: ${error.message}`, 'red');
    return false;
  }
}

async function testDetailedMode(commandHandler) {
  log('\n--- Test 3: Set Detailed Mode ---', 'yellow');

  try {
    const result = await commandHandler.execute(TEST_USER_ID, '/detailed');

    if (!result.success) {
      log(`✗ FAILED: ${result.message}`, 'red');
      return false;
    }

    if (!result.message.includes('Detailed') || !result.message.includes('comprehensive')) {
      log(`✗ FAILED: Unexpected response message`, 'red');
      log(`  Message: ${result.message}`, 'red');
      return false;
    }

    log('✓ PASSED: Detailed mode set successfully', 'green');
    return true;
  } catch (error) {
    log(`✗ FAILED: ${error.message}`, 'red');
    return false;
  }
}

async function testCodeOnlyMode(commandHandler) {
  log('\n--- Test 4: Set Code-Only Mode ---', 'yellow');

  try {
    const result = await commandHandler.execute(TEST_USER_ID, '/code-only');

    if (!result.success) {
      log(`✗ FAILED: ${result.message}`, 'red');
      return false;
    }

    if (!result.message.includes('Code Only') || !result.message.includes('only code')) {
      log(`✗ FAILED: Unexpected response message`, 'red');
      log(`  Message: ${result.message}`, 'red');
      return false;
    }

    log('✓ PASSED: Code-only mode set successfully', 'green');
    return true;
  } catch (error) {
    log(`✗ FAILED: ${error.message}`, 'red');
    return false;
  }
}

async function testExplainOnlyMode(commandHandler) {
  log('\n--- Test 5: Set Explain-Only Mode ---', 'yellow');

  try {
    const result = await commandHandler.execute(TEST_USER_ID, '/explain-only');

    if (!result.success) {
      log(`✗ FAILED: ${result.message}`, 'red');
      return false;
    }

    if (!result.message.includes('Explain Only') || !result.message.includes('without code')) {
      log(`✗ FAILED: Unexpected response message`, 'red');
      log(`  Message: ${result.message}`, 'red');
      return false;
    }

    log('✓ PASSED: Explain-only mode set successfully', 'green');
    return true;
  } catch (error) {
    log(`✗ FAILED: ${error.message}`, 'red');
    return false;
  }
}

async function testPreferencePersistence(db) {
  log('\n--- Test 6: Preference Persistence ---', 'yellow');

  try {
    // Check that preference was saved
    const preference = db.getUserPreference(TEST_USER_ID, 'responseMode');

    if (preference !== 'explain-only') {
      log(`✗ FAILED: Preference not persisted correctly`, 'red');
      log(`  Expected: explain-only, Got: ${preference}`, 'red');
      return false;
    }

    log('✓ PASSED: Preference persisted correctly', 'green');
    return true;
  } catch (error) {
    log(`✗ FAILED: ${error.message}`, 'red');
    return false;
  }
}

async function testNoActiveSession(commandHandler, sessionManager) {
  log('\n--- Test 7: No Active Session Error ---', 'yellow');

  try {
    const testUserId = '628999999999';

    const result = await commandHandler.execute(testUserId, '/brief');

    if (result.success) {
      log(`✗ FAILED: Should have failed without active session`, 'red');
      return false;
    }

    if (!result.message.includes('No active session')) {
      log(`✗ FAILED: Unexpected error message`, 'red');
      log(`  Message: ${result.message}`, 'red');
      return false;
    }

    log('✓ PASSED: Correctly rejected without active session', 'green');
    return true;
  } catch (error) {
    log(`✗ FAILED: ${error.message}`, 'red');
    return false;
  }
}

async function testSessionManagerIntegration(sessionManager) {
  log('\n--- Test 8: SessionManager Integration ---', 'yellow');

  try {
    // Get current mode
    const currentMode = sessionManager.getResponseMode(TEST_USER_ID);

    if (currentMode !== 'explain-only') {
      log(`✗ FAILED: SessionManager returned wrong mode`, 'red');
      log(`  Expected: explain-only, Got: ${currentMode}`, 'red');
      return false;
    }

    // Set mode via SessionManager
    sessionManager.setResponseMode(TEST_USER_ID, 'brief');

    const newMode = sessionManager.getResponseMode(TEST_USER_ID);
    if (newMode !== 'brief') {
      log(`✗ FAILED: SessionManager mode not updated`, 'red');
      log(`  Expected: brief, Got: ${newMode}`, 'red');
      return false;
    }

    log('✓ PASSED: SessionManager integration works', 'green');
    return true;
  } catch (error) {
    log(`✗ FAILED: ${error.message}`, 'red');
    return false;
  }
}

async function runAllTests() {
  log('\n════════════════════════════════════════', 'blue');
  log('   Response Commands Test Suite (Phase 4)', 'blue');
  log('════════════════════════════════════════', 'blue');

  let passed = 0;
  let failed = 0;

  try {
    const { db, sessionManager, commandHandler } = await setup();

    // Create session first
    log('\n=== Creating test session ===', 'blue');
    const createResult = await commandHandler.execute(TEST_USER_ID, '/newsession');
    if (!createResult.success) {
      log(`✗ Failed to create session: ${createResult.message}`, 'red');
      process.exit(1);
    }
    log('✓ Test session created', 'green');

    // Select project
    const projectResult = await commandHandler.execute(TEST_USER_ID, '/project test-project');
    if (!projectResult.success) {
      log(`✗ Failed to select project: ${projectResult.message}`, 'red');
      process.exit(1);
    }
    log('✓ Project selected', 'green');

    // Run tests
    const tests = [
      () => testBriefMode(commandHandler),
      () => testBalancedMode(commandHandler),
      () => testDetailedMode(commandHandler),
      () => testCodeOnlyMode(commandHandler),
      () => testExplainOnlyMode(commandHandler),
      () => testPreferencePersistence(db),
      () => testNoActiveSession(commandHandler, sessionManager),
      () => testSessionManagerIntegration(sessionManager)
    ];

    for (const test of tests) {
      const result = await test();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    }

    // Cleanup
    await teardown(sessionManager, db);

    // Print results
    log('\n════════════════════════════════════════', 'blue');
    log('   Test Results', 'blue');
    log('════════════════════════════════════════', 'blue');
    log(`Total Tests: ${passed + failed}`, 'blue');
    log(`Passed: ${passed}`, 'green');
    log(`Failed: ${failed}`, failed > 0 ? 'red' : 'green');
    log('════════════════════════════════════════\n', 'blue');

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    log(`\n✗ Test suite failed with error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runAllTests();
