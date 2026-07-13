/**
 * Stream Handler Unit Tests
 * Tests for ClaudeStreamHandler parsing logic
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ClaudeStreamHandler } from '../../src/claude/stream-handler.js';
import {
  loadMockResponse,
  parseJsonl,
  simulateStreaming,
  createSpy,
  extractText,
  extractToolUses
} from '../helpers/test-utils.js';

describe('ClaudeStreamHandler', () => {

  describe('Basic Text Streaming', () => {
    it('should parse simple text response', () => {
      // Arrange
      const eventSpy = createSpy();
      const handler = new ClaudeStreamHandler({
        onEvent: eventSpy
      });

      const mockData = loadMockResponse('simple-text.jsonl');

      // Act
      handler.feed(mockData);

      // Assert
      const events = eventSpy.calls.map(call => call[0]);

      // Should have message_start
      const messageStart = events.find(e => e.type === 'message_start');
      expect(messageStart).toBeDefined();
      expect(messageStart.message.id).toBe('msg_01ABC123');

      // Should have text deltas
      const textDeltas = events.filter(e => e.type === 'text_delta');
      expect(textDeltas.length).toBeGreaterThanOrEqual(3);

      // Reconstruct full text
      const fullText = extractText(events);
      expect(fullText).toBe('Hello World!');

      // Should have message_stop
      const messageStop = events.find(e => e.type === 'message_stop');
      expect(messageStop).toBeDefined();
    });

    it('should handle unicode and emoji correctly', () => {
      const eventSpy = createSpy();
      const handler = new ClaudeStreamHandler({
        onEvent: eventSpy
      });

      const mockData = loadMockResponse('unicode-emoji.jsonl');
      handler.feed(mockData);

      const events = eventSpy.calls.map(call => call[0]);
      const fullText = extractText(events);

      expect(fullText).toContain('你好');
      expect(fullText).toContain('مرحبا');
      expect(fullText).toContain('🚀🎉');
    });
  });

  describe('Tool Use Flow', () => {
    it('should parse tool_use with input streaming', () => {
      const eventSpy = createSpy();
      const handler = new ClaudeStreamHandler({
        onEvent: eventSpy
      });

      const mockData = loadMockResponse('tool-use.jsonl');
      handler.feed(mockData);

      const events = eventSpy.calls.map(call => call[0]);

      // Should have thinking block
      const thinkingDeltas = events.filter(e => e.type === 'thinking_delta');
      expect(thinkingDeltas.length).toBeGreaterThan(0);

      // Should have tool_use event
      const toolUses = extractToolUses(events);
      expect(toolUses.length).toBe(1);
      expect(toolUses[0].name).toBe('Read');
      expect(toolUses[0].input).toEqual({ file_path: '/tmp/test.txt' });

      // Should stop with tool_use reason
      const messageStop = events.find(e => e.type === 'message_stop');
      expect(messageStop).toBeDefined();
    });

    it('should handle multiple tools in one response', () => {
      const eventSpy = createSpy();
      const handler = new ClaudeStreamHandler({
        onEvent: eventSpy
      });

      const mockData = loadMockResponse('multi-tool.jsonl');
      handler.feed(mockData);

      const events = eventSpy.calls.map(call => call[0]);
      const toolUses = extractToolUses(events);

      expect(toolUses.length).toBe(2);
      expect(toolUses[0].name).toBe('Bash');
      expect(toolUses[0].input).toEqual({ command: 'ls -la' });
      expect(toolUses[1].name).toBe('Read');
      expect(toolUses[1].input).toEqual({ file_path: 'config.json' });
    });
  });

  describe('Multiple Content Blocks', () => {
    it('should handle multiple text blocks', () => {
      const eventSpy = createSpy();
      const handler = new ClaudeStreamHandler({
        onEvent: eventSpy
      });

      const mockData = loadMockResponse('multi-block.jsonl');
      handler.feed(mockData);

      const events = eventSpy.calls.map(call => call[0]);

      // Should have blocks for both indices
      const block0Deltas = events.filter(e => e.index === 0 && e.type === 'text_delta');
      const block1Deltas = events.filter(e => e.index === 1 && e.type === 'text_delta');

      expect(block0Deltas.length).toBeGreaterThan(0);
      expect(block1Deltas.length).toBeGreaterThan(0);

      const fullText = extractText(events);
      expect(fullText).toContain('First sentence');
      expect(fullText).toContain('Second block');
    });
  });

  describe('Buffer Edge Cases', () => {
    it('should handle incomplete JSON at buffer boundary', () => {
      const eventSpy = createSpy();
      const handler = new ClaudeStreamHandler({
        onEvent: eventSpy
      });

      // Feed incomplete JSON
      handler.feed('{"type":"stream_event","event":{"type":"message_start","mes');

      // No events yet
      expect(eventSpy.callCount()).toBe(0);

      // Complete the JSON
      handler.feed('sage":{"id":"msg_123"}}}\n');

      // Now should have event
      const events = eventSpy.calls.map(call => call[0]);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('message_start');
    });

    it('should handle multiple messages in one chunk', () => {
      const eventSpy = createSpy();
      const handler = new ClaudeStreamHandler({
        onEvent: eventSpy
      });

      // Multiple complete lines in one chunk
      const multiline = [
        '{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg_1"}}}',
        '{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}}',
        '{"type":"stream_event","event":{"type":"content_block_stop","index":0}}',
        ''
      ].join('\n');

      handler.feed(multiline);

      const events = eventSpy.calls.map(call => call[0]);
      expect(events.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle empty lines and whitespace', () => {
      const eventSpy = createSpy();
      const handler = new ClaudeStreamHandler({
        onEvent: eventSpy
      });

      handler.feed('\n\n  \n');
      handler.feed('{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg_1"}}}\n');
      handler.feed('\n  \n');

      const events = eventSpy.calls.map(call => call[0]);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('message_start');
    });

    it('should handle streaming in small chunks', async () => {
      const eventSpy = createSpy();
      const handler = new ClaudeStreamHandler({
        onEvent: eventSpy
      });

      const mockData = loadMockResponse('simple-text.jsonl');

      // Simulate slow streaming (10 chars per chunk)
      await simulateStreaming(handler, mockData, 10);

      const events = eventSpy.calls.map(call => call[0]);
      const fullText = extractText(events);

      expect(fullText).toBe('Hello World!');
    });
  });

  describe('Error Handling', () => {
    it('should emit error event for malformed JSON', () => {
      const eventSpy = createSpy();
      const handler = new ClaudeStreamHandler({
        onEvent: eventSpy
      });

      handler.feed('{"invalid json\n');

      const events = eventSpy.calls.map(call => call[0]);
      const errorEvent = events.find(e => e.type === 'error');

      expect(errorEvent).toBeDefined();
      expect(errorEvent.message).toContain('Parse error');
    });

    it('should continue processing after error', () => {
      const eventSpy = createSpy();
      const handler = new ClaudeStreamHandler({
        onEvent: eventSpy
      });

      const mockData = loadMockResponse('error-malformed.jsonl');
      handler.feed(mockData);

      const events = eventSpy.calls.map(call => call[0]);

      // Should have error
      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);

      // But also valid events after
      const textEvents = events.filter(e => e.type === 'text_delta');
      expect(textEvents.length).toBeGreaterThan(0);
    });

    it('should handle unknown message types gracefully', () => {
      const eventSpy = createSpy();
      const handler = new ClaudeStreamHandler({
        onEvent: eventSpy
      });

      handler.feed('{"type":"unknown_type","data":"test"}\n');

      const events = eventSpy.calls.map(call => call[0]);
      const unknownEvent = events.find(e => e.type === 'unknown_message' || e.type === 'unknown_event');

      expect(unknownEvent).toBeDefined();
    });
  });

  describe('System Messages', () => {
    it('should handle system init message', () => {
      const eventSpy = createSpy();
      const handler = new ClaudeStreamHandler({
        onEvent: eventSpy
      });

      handler.feed('{"type":"system","subtype":"init","model":"claude-opus-4","session_id":"abc-123"}\n');

      const events = eventSpy.calls.map(call => call[0]);
      const systemEvent = events.find(e => e.type === 'system');

      expect(systemEvent).toBeDefined();
      expect(systemEvent.subtype).toBe('init');
    });

    it('should handle system status messages', () => {
      const eventSpy = createSpy();
      const handler = new ClaudeStreamHandler({
        onEvent: eventSpy
      });

      handler.feed('{"type":"system","subtype":"status","status":"thinking"}\n');

      const events = eventSpy.calls.map(call => call[0]);
      const systemEvent = events.find(e => e.type === 'system');

      expect(systemEvent).toBeDefined();
      expect(systemEvent.data.status).toBe('thinking');
    });
  });

  describe('State Management', () => {
    it('should track block states correctly', () => {
      const handler = new ClaudeStreamHandler();

      expect(handler.blockStates.size).toBe(0);

      handler.feed('{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}}\n');

      expect(handler.blockStates.size).toBe(1);

      handler.feed('{"type":"stream_event","event":{"type":"content_block_stop","index":0}}\n');

      expect(handler.blockStates.size).toBe(0);
    });

    it('should clear buffer after processing', () => {
      const handler = new ClaudeStreamHandler();

      handler.feed('{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg_1"}}}\n');

      expect(handler.buffer).toBe('');

      handler.feed('incomplete');
      expect(handler.buffer).toBe('incomplete');

      handler.feed(' line\n');
      expect(handler.buffer).toBe('');
    });
  });

});
