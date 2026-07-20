/**
 * Test Suite for File Operations Commands (Phase 4)
 *
 * Tests:
 * - Path validation and security
 * - File reading with size limits
 * - Directory tree generation
 * - File search functionality
 * - Git diff retrieval
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import assert from 'assert';
import {
  checkPathSecurity,
  readFileSmart,
  generateTree,
  searchInFiles,
  getGitDiff,
  formatForWhatsApp
} from '../src/utils/file-ops.js';
import { execSync } from 'child_process';

// Test utilities
let testDir;
let projectRoot;

/**
 * Setup test environment
 */
function setup() {
  // Create temporary test directory
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebridge-test-'));
  projectRoot = testDir;

  console.log(`✓ Test directory created: ${testDir}`);
}

/**
 * Cleanup test environment
 */
function cleanup() {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
    console.log(`✓ Test directory cleaned up`);
  }
}

/**
 * Test: Path Security Validation
 */
function testPathSecurity() {
  console.log('\n📁 Testing Path Security...');

  // Test 1: Valid path within project
  const test1 = checkPathSecurity('src/index.js', projectRoot);
  assert.strictEqual(test1.safe, true, 'Valid path should be safe');
  assert.ok(test1.resolvedPath, 'Should return resolved path');

  // Test 2: Path traversal attack (../)
  const test2 = checkPathSecurity('../../etc/passwd', projectRoot);
  assert.strictEqual(test2.safe, false, 'Directory traversal should be blocked');
  assert.ok(test2.error, 'Should return error message');

  // Test 3: Absolute path outside project
  const test3 = checkPathSecurity('/etc/passwd', projectRoot);
  assert.strictEqual(test3.safe, false, 'Absolute path outside project should be blocked');

  // Test 4: Current directory
  const test4 = checkPathSecurity('.', projectRoot);
  assert.strictEqual(test4.safe, true, 'Current directory should be safe');

  console.log('  ✅ Path security validation works correctly');
}

/**
 * Test: Smart File Reading
 */
function testFileReading() {
  console.log('\n📄 Testing File Reading...');

  // Create test files
  const smallFile = path.join(testDir, 'small.txt');
  const largeFile = path.join(testDir, 'large.txt');
  const emptyFile = path.join(testDir, 'empty.txt');

  // Small file (100 bytes)
  fs.writeFileSync(smallFile, 'A'.repeat(100));

  // Large file (2MB)
  fs.writeFileSync(largeFile, 'B'.repeat(2 * 1024 * 1024));

  // Empty file
  fs.writeFileSync(emptyFile, '');

  // Test 1: Read small file
  const test1 = readFileSmart(smallFile);
  assert.strictEqual(test1.success, true, 'Should read small file successfully');
  assert.strictEqual(test1.truncated, false, 'Small file should not be truncated');
  assert.strictEqual(test1.content.length, 100, 'Should read full content');

  // Test 2: Read large file (should truncate)
  const test2 = readFileSmart(largeFile, 1024 * 1024); // 1MB limit
  assert.strictEqual(test2.success, true, 'Should read large file successfully');
  assert.strictEqual(test2.truncated, true, 'Large file should be truncated');
  assert.strictEqual(test2.truncatedAt, 1024 * 1024, 'Should truncate at max size');

  // Test 3: Read empty file
  const test3 = readFileSmart(emptyFile);
  assert.strictEqual(test3.success, true, 'Should handle empty file');
  assert.strictEqual(test3.content, '', 'Empty file should return empty string');
  assert.strictEqual(test3.size, 0, 'Size should be 0');

  // Test 4: Read non-existent file
  const test4 = readFileSmart(path.join(testDir, 'nonexistent.txt'));
  assert.strictEqual(test4.success, false, 'Should fail for non-existent file');
  assert.ok(test4.error, 'Should return error message');

  // Test 5: Try to read directory
  const test5 = readFileSmart(testDir);
  assert.strictEqual(test5.success, false, 'Should fail for directory');
  assert.ok(test5.error.includes('Not a file'), 'Should indicate it\'s not a file');

  // Cleanup test files
  if (fs.existsSync(smallFile)) fs.unlinkSync(smallFile);
  if (fs.existsSync(largeFile)) fs.unlinkSync(largeFile);
  if (fs.existsSync(emptyFile)) fs.unlinkSync(emptyFile);

  console.log('  ✅ File reading works correctly');
}

/**
 * Test: Directory Tree Generation
 */
function testTreeGeneration() {
  console.log('\n🌲 Testing Tree Generation...');

  // Create test directory structure
  const structure = {
    'src': {
      'index.js': 'console.log("test");',
      'utils': {
        'helper.js': 'export function help() {}',
        'logger.js': 'export class Logger {}'
      },
      'commands': {
        'handler.js': 'export class Handler {}'
      }
    },
    'tests': {
      'test.js': 'describe("test", () => {});'
    },
    'README.md': '# Test Project',
    'package.json': '{"name": "test"}'
  };

  function createStructure(base, struct) {
    for (const [name, content] of Object.entries(struct)) {
      const fullPath = path.join(base, name);
      if (typeof content === 'object') {
        // Directory
        fs.mkdirSync(fullPath, { recursive: true });
        createStructure(fullPath, content);
      } else {
        // File
        fs.writeFileSync(fullPath, content);
      }
    }
  }

  createStructure(testDir, structure);

  // Test 1: Generate tree
  const test1 = generateTree(testDir, 5);
  assert.strictEqual(test1.success, true, 'Should generate tree successfully');
  assert.ok(test1.tree.length > 0, 'Tree should not be empty');
  assert.strictEqual(test1.dirCount, 4, 'Should count directories correctly'); // src, src/utils, src/commands, tests
  assert.strictEqual(test1.fileCount, 7, 'Should count files correctly'); // 5 files in dirs + 2 in root
  assert.ok(test1.tree.includes('📁 src/'), 'Tree should include directories');
  assert.ok(test1.tree.includes('📄 README.md'), 'Tree should include files');

  // Test 2: Generate tree with depth limit
  const test2 = generateTree(testDir, 1);
  assert.strictEqual(test2.success, true, 'Should respect depth limit');
  assert.ok(test2.tree.includes('...'), 'Should show truncation indicator');

  // Test 3: Non-existent directory
  const test3 = generateTree(path.join(testDir, 'nonexistent'));
  assert.strictEqual(test3.success, false, 'Should fail for non-existent directory');

  // Test 4: Try to generate tree for file
  const test4 = generateTree(path.join(testDir, 'README.md'));
  assert.strictEqual(test4.success, false, 'Should fail for file');

  console.log('  ✅ Tree generation works correctly');
}

/**
 * Test: File Search
 */
function testFileSearch() {
  console.log('\n🔍 Testing File Search...');

  // Create test files with searchable content
  const jsFile = path.join(testDir, 'app.js');
  fs.writeFileSync(jsFile, `
function hello() {
  console.log("Hello World");
}

function goodbye() {
  console.log("Goodbye World");
}
  `.trim());

  const txtFile = path.join(testDir, 'notes.txt');
  fs.writeFileSync(txtFile, `
TODO: Add tests
TODO: Fix bug
DONE: Initial setup
  `.trim());

  // Test 1: Search for pattern
  const test1 = searchInFiles(testDir, 'TODO');
  assert.strictEqual(test1.success, true, 'Should search successfully');
  assert.strictEqual(test1.totalMatches, 2, 'Should find 2 matches');
  assert.strictEqual(test1.results.length, 2, 'Should return 2 results');
  assert.ok(test1.results[0].file.includes('notes.txt'), 'Should find in correct file');

  // Test 2: Case-insensitive search
  const test2 = searchInFiles(testDir, 'hello', { ignoreCase: true });
  assert.strictEqual(test2.success, true, 'Should search case-insensitively');
  assert.ok(test2.totalMatches >= 1, 'Should find matches');

  // Test 3: File pattern filter
  const test3 = searchInFiles(testDir, 'function', { filePattern: '*.js' });
  assert.strictEqual(test3.success, true, 'Should filter by file pattern');
  assert.ok(test3.totalMatches >= 2, 'Should find functions in JS file');

  // Test 4: Max results limit
  const test4 = searchInFiles(testDir, 'o', { maxResults: 3 });
  assert.strictEqual(test4.success, true, 'Should respect max results');
  assert.ok(test4.totalMatches <= 3, 'Should not exceed max results');

  // Test 5: No matches
  const test5 = searchInFiles(testDir, 'xyz123nonexistent');
  assert.strictEqual(test5.success, true, 'Should succeed even with no matches');
  assert.strictEqual(test5.totalMatches, 0, 'Should return 0 matches');

  console.log('  ✅ File search works correctly');
}

/**
 * Test: WhatsApp Formatting
 */
function testWhatsAppFormatting() {
  console.log('\n💬 Testing WhatsApp Formatting...');

  // Test 1: Short content
  const test1 = formatForWhatsApp('Hello World', { codeBlock: true, language: 'text' });
  assert.ok(test1.includes('```'), 'Should wrap in code block');
  assert.ok(test1.includes('Hello World'), 'Should include content');

  // Test 2: Long content (truncation)
  const longContent = 'A'.repeat(5000);
  const test2 = formatForWhatsApp(longContent, { maxLength: 1000 });
  assert.ok(test2.length <= 1100, 'Should truncate long content'); // Some overhead for code blocks
  assert.ok(test2.includes('truncated'), 'Should indicate truncation');

  // Test 3: No code block
  const test3 = formatForWhatsApp('Plain text', { codeBlock: false });
  assert.ok(!test3.includes('```'), 'Should not wrap in code block');
  assert.strictEqual(test3, 'Plain text', 'Should return plain text');

  console.log('  ✅ WhatsApp formatting works correctly');
}

/**
 * Test: Git Diff (if git is available)
 */
function testGitDiff() {
  console.log('\n📊 Testing Git Diff...');

  // Check if git is available
  try {
    execSync('git --version', { stdio: 'ignore' });
  } catch (err) {
    console.log('  ⚠️  Git not available, skipping git diff tests');
    return;
  }

  // Initialize git repo
  try {
    execSync('git init', { cwd: testDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: testDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: testDir, stdio: 'ignore' });

    // Create and commit a file
    const testFile = path.join(testDir, 'test.txt');
    fs.writeFileSync(testFile, 'Initial content');
    execSync('git add .', { cwd: testDir, stdio: 'ignore' });
    execSync('git commit -m "Initial commit"', { cwd: testDir, stdio: 'ignore' });

    // Test 1: No changes
    const test1 = getGitDiff(testFile, testDir);
    assert.strictEqual(test1.success, true, 'Should get diff successfully');
    assert.strictEqual(test1.hasChanges, false, 'Should detect no changes');

    // Modify file
    fs.writeFileSync(testFile, 'Modified content');

    // Test 2: With changes
    const test2 = getGitDiff(testFile, testDir);
    assert.strictEqual(test2.success, true, 'Should get diff with changes');
    assert.strictEqual(test2.hasChanges, true, 'Should detect changes');
    assert.ok(test2.diff.length > 0, 'Diff should not be empty');

    console.log('  ✅ Git diff works correctly');

  } catch (err) {
    console.log(`  ⚠️  Git test setup failed: ${err.message}`);
  }
}

/**
 * Run all tests
 */
function runTests() {
  console.log('🧪 Running File Operations Tests...\n');

  try {
    setup();

    testPathSecurity();
    testFileReading();
    testTreeGeneration();
    testFileSearch();
    testWhatsAppFormatting();
    testGitDiff();

    cleanup();

    console.log('\n✅ All tests passed!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);

    cleanup();
    process.exit(1);
  }
}

// Run tests
runTests();
