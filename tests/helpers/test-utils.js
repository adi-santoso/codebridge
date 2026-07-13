/**
 * Test Utilities for CodeBridge
 * Helper functions for testing Claude stream handler
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load mock JSONL response from fixtures
 * @param {string} filename - Name of the JSONL file (e.g., 'simple-text.jsonl')
 * @returns {string} - Raw JSONL content
 */
export function loadMockResponse(filename) {
  const filePath = path.join(__dirname, '..', 'fixtures', 'mock-responses', filename);
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Parse JSONL content into array of objects
 * @param {string} jsonl - JSONL content
 * @returns {Array<Object>} - Array of parsed JSON objects
 */
export function parseJsonl(jsonl) {
  return jsonl
    .trim()
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (err) {
        return { __parse_error: err.message, __raw: line };
      }
    });
}

/**
 * Simulate streaming by feeding data in chunks
 * Useful for testing buffer edge cases
 * @param {Object} handler - Stream handler instance
 * @param {string} content - Content to stream
 * @param {number} chunkSize - Size of each chunk
 */
export async function simulateStreaming(handler, content, chunkSize = 50) {
  for (let i = 0; i < content.length; i += chunkSize) {
    const chunk = content.slice(i, i + chunkSize);
    handler.feed(chunk);
    // Small delay to simulate network timing
    await new Promise(resolve => setTimeout(resolve, 1));
  }
}

/**
 * Collect events from a handler
 * Returns a promise that resolves when message_stop is received
 * @param {Function} handlerFactory - Function that creates handler with onEvent callback
 * @param {number} timeout - Max time to wait (ms)
 * @returns {Promise<Array>} - Collected events
 */
export function collectEvents(handlerFactory, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const events = [];
    const timeoutId = setTimeout(() => {
      reject(new Error(`collectEvents timeout after ${timeout}ms`));
    }, timeout);

    const handler = handlerFactory((event) => {
      events.push(event);
      if (event.type === 'message_stop') {
        clearTimeout(timeoutId);
        resolve(events);
      }
    });

    // Return handler so caller can feed data
    handler.__resolve = () => {
      clearTimeout(timeoutId);
      resolve(events);
    };

    return handler;
  });
}

/**
 * Create a spy that tracks all calls
 * @returns {Object} - Spy object with calls array and function
 */
export function createSpy() {
  const calls = [];
  const spy = (...args) => {
    calls.push(args);
  };
  spy.calls = calls;
  spy.callCount = () => calls.length;
  spy.lastCall = () => calls[calls.length - 1];
  spy.reset = () => { calls.length = 0; };
  return spy;
}

/**
 * Wait for a condition to be true
 * @param {Function} condition - Function that returns boolean
 * @param {number} timeout - Max time to wait (ms)
 * @param {number} interval - Check interval (ms)
 * @returns {Promise<boolean>}
 */
export async function waitFor(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`waitFor timeout after ${timeout}ms`);
}

/**
 * Assert that events match expected pattern
 * @param {Array} events - Collected events
 * @param {Array} expectedTypes - Expected event types in order
 */
export function assertEventSequence(events, expectedTypes) {
  const actualTypes = events.map(e => e.type);

  if (actualTypes.length !== expectedTypes.length) {
    throw new Error(
      `Event count mismatch. Expected ${expectedTypes.length}, got ${actualTypes.length}\n` +
      `Expected: ${expectedTypes.join(', ')}\n` +
      `Actual: ${actualTypes.join(', ')}`
    );
  }

  for (let i = 0; i < expectedTypes.length; i++) {
    if (actualTypes[i] !== expectedTypes[i]) {
      throw new Error(
        `Event type mismatch at index ${i}. Expected '${expectedTypes[i]}', got '${actualTypes[i]}'`
      );
    }
  }
}

/**
 * Extract text content from events
 * @param {Array} events - Collected events
 * @returns {string} - Concatenated text
 */
export function extractText(events) {
  return events
    .filter(e => e.type === 'text_delta' || e.type === 'content_block_delta')
    .map(e => e.text || e.delta?.text || '')
    .join('');
}

/**
 * Extract tool use events
 * @param {Array} events - Collected events
 * @returns {Array<Object>} - Tool use events with parsed input
 */
export function extractToolUses(events) {
  return events
    .filter(e => e.type === 'tool_use' || e.type === 'content_block_start')
    .filter(e => e.content_block?.type === 'tool_use' || e.name)
    .map(e => ({
      id: e.id || e.content_block?.id,
      name: e.name || e.content_block?.name,
      input: e.input || e.content_block?.input || {}
    }));
}

/**
 * Mock tool executor for testing
 * @param {Object} responses - Map of tool names to response functions
 * @returns {Function} - Tool executor function
 */
export function createMockToolExecutor(responses = {}) {
  const defaultResponses = {
    Read: () => ({ content: 'Mock file content', success: true }),
    Write: () => ({ success: true }),
    Bash: () => ({ stdout: 'Mock command output', stderr: '', exitCode: 0 }),
    Edit: () => ({ success: true })
  };

  return (toolName, input) => {
    const handler = responses[toolName] || defaultResponses[toolName];
    if (!handler) {
      throw new Error(`No mock response for tool: ${toolName}`);
    }
    return handler(input);
  };
}

export default {
  loadMockResponse,
  parseJsonl,
  simulateStreaming,
  collectEvents,
  createSpy,
  waitFor,
  assertEventSequence,
  extractText,
  extractToolUses,
  createMockToolExecutor
};
