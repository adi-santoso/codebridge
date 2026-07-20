#!/usr/bin/env node

/**
 * Phase 8 Implementation Verification Script
 *
 * Verifies that all Phase 8 components are correctly implemented
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

console.log('🔍 Phase 8: Templates & Shortcuts - Implementation Verification\n');

const checks = [];
let passed = 0;
let failed = 0;

/**
 * Check if file exists
 */
function checkFile(path, description) {
  const fullPath = resolve(process.cwd(), path);
  const exists = existsSync(fullPath);

  checks.push({
    name: description,
    status: exists ? '✅' : '❌',
    details: exists ? path : `Missing: ${path}`
  });

  if (exists) passed++;
  else failed++;

  return exists;
}

/**
 * Check if file contains text
 */
function checkFileContains(path, text, description) {
  const fullPath = resolve(process.cwd(), path);

  if (!existsSync(fullPath)) {
    checks.push({
      name: description,
      status: '❌',
      details: `File not found: ${path}`
    });
    failed++;
    return false;
  }

  const content = readFileSync(fullPath, 'utf-8');
  const contains = content.includes(text);

  checks.push({
    name: description,
    status: contains ? '✅' : '❌',
    details: contains ? 'Found' : `Not found in ${path}`
  });

  if (contains) passed++;
  else failed++;

  return contains;
}

// ============================================================================
// Check Template Files
// ============================================================================

console.log('📁 Template Definitions:');
checkFile('src/commands/templates/ask.js', 'Ask template');
checkFile('src/commands/templates/fix.js', 'Fix template');
checkFile('src/commands/templates/review.js', 'Review template');
checkFile('src/commands/templates/test.js', 'Test template');
checkFile('src/commands/templates/doc.js', 'Doc template');
checkFile('src/commands/templates/refactor.js', 'Refactor template');

// ============================================================================
// Check Handler
// ============================================================================

console.log('\n📁 Handler Implementation:');
checkFile('src/commands/handlers/template.js', 'Template handler');
checkFileContains('src/commands/handlers/template.js', 'async function executeTemplate', 'executeTemplate function');
checkFileContains('src/commands/handlers/template.js', 'async function extractContext', 'extractContext function');
checkFileContains('src/commands/handlers/template.js', 'export async function ask', 'ask handler');
checkFileContains('src/commands/handlers/template.js', 'export async function fix', 'fix handler');
checkFileContains('src/commands/handlers/template.js', 'export async function review', 'review handler');
checkFileContains('src/commands/handlers/template.js', 'export async function test', 'test handler');
checkFileContains('src/commands/handlers/template.js', 'export async function doc', 'doc handler');
checkFileContains('src/commands/handlers/template.js', 'export async function refactor', 'refactor handler');

// ============================================================================
// Check Registry Integration
// ============================================================================

console.log('\n📁 Command Registry:');
checkFileContains('src/commands/registry.js', "name: 'ask'", '/ask command registered');
checkFileContains('src/commands/registry.js', "name: 'fix'", '/fix command registered');
checkFileContains('src/commands/registry.js', "name: 'review'", '/review command registered');
checkFileContains('src/commands/registry.js', "name: 'test'", '/test command registered');
checkFileContains('src/commands/registry.js', "name: 'doc'", '/doc command registered');
checkFileContains('src/commands/registry.js', "name: 'refactor'", '/refactor command registered');
checkFileContains('src/commands/registry.js', "category: 'template'", 'Template category');

// ============================================================================
// Check Handler Routing
// ============================================================================

console.log('\n📁 Command Handler Routing:');
checkFileContains('src/commands/handler.js', "import * as templateHandlers from './handlers/template.js'", 'Template handlers imported');
checkFileContains('src/commands/handler.js', 'this.templateHandlers = templateHandlers', 'Template handlers assigned');
checkFileContains('src/commands/handler.js', "handlerPath.startsWith('template.')", 'Template routing added');

// ============================================================================
// Check Configuration
// ============================================================================

console.log('\n📁 Configuration:');
checkFileContains('.env.example', 'TEMPLATE_ENABLED', 'TEMPLATE_ENABLED config');
checkFileContains('.env.example', 'TEMPLATE_MAX_CONTEXT_SIZE', 'TEMPLATE_MAX_CONTEXT_SIZE config');
checkFileContains('.env.example', 'TEMPLATE_TIMEOUT', 'TEMPLATE_TIMEOUT config');

// ============================================================================
// Check Tests
// ============================================================================

console.log('\n📁 Tests:');
checkFile('tests/test-template-commands.js', 'Template command tests');
checkFileContains('tests/test-template-commands.js', "describe('Template Commands'", 'Test suite structure');
checkFileContains('tests/test-template-commands.js', "describe('/ask command'", '/ask tests');
checkFileContains('tests/test-template-commands.js', "describe('/fix command'", '/fix tests');
checkFileContains('tests/test-template-commands.js', "describe('/review command'", '/review tests');

// ============================================================================
// Check Documentation
// ============================================================================

console.log('\n📁 Documentation:');
checkFile('docs/COMMAND_SYSTEM_PHASE8.md', 'User documentation');
checkFile('docs/PHASE8_IMPLEMENTATION_SUMMARY.md', 'Implementation summary');
checkFileContains('docs/COMMAND_SYSTEM_PHASE8.md', '/ask', 'Ask command docs');
checkFileContains('docs/COMMAND_SYSTEM_PHASE8.md', '/fix', 'Fix command docs');
checkFileContains('docs/COMMAND_SYSTEM_PHASE8.md', '/review', 'Review command docs');

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('📊 VERIFICATION SUMMARY');
console.log('='.repeat(70));

console.log(`\n✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`);

if (failed === 0) {
  console.log('🎉 All checks passed! Phase 8 implementation is complete.\n');
  console.log('Next steps:');
  console.log('  1. Run tests: npm test tests/test-template-commands.js');
  console.log('  2. Review documentation: docs/COMMAND_SYSTEM_PHASE8.md');
  console.log('  3. Test with real Claude API (if available)');
  console.log('  4. Update main README.md with Phase 8 info\n');
  process.exit(0);
} else {
  console.log('⚠️  Some checks failed. Review the details above.\n');

  // Print failed checks
  console.log('Failed checks:');
  checks.filter(c => c.status === '❌').forEach(c => {
    console.log(`  ${c.status} ${c.name}: ${c.details}`);
  });
  console.log('');

  process.exit(1);
}
