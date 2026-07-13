/**
 * Claude Stream Handler
 * Parses claude-stream-json protocol output from Claude CLI
 *
 * Ported from open-design/apps/daemon/src/runtimes/claude-stream.ts
 * Handles both streaming (with --include-partial-messages) and non-streaming modes
 */

export class ClaudeStreamHandler {
  constructor(options = {}) {
    this.onEvent = options.onEvent || (() => {});
    this.buffer = '';

    // Per-content-block state, keyed by index
    this.blockStates = new Map();

    // Tool use IDs that were already emitted from streaming
    // (to avoid duplicating them from the final assistant wrapper)
    this.streamedToolUseIds = new Set();

    // Current message ID for tracking streamed content
    this.currentMessageId = null;
  }

  /**
   * Feed a chunk of data to the handler
   * @param {string} chunk - Raw stdout chunk from Claude CLI
   */
  feed(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        this.handleMessage(message);
      } catch (err) {
        this.emit({
          type: 'error',
          error: err,
          message: `Parse error: ${err.message}`,
          raw: line
        });
      }
    }
  }

  /**
   * Route message to appropriate handler
   */
  handleMessage(message) {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'system') {
      this.handleSystemMessage(message);
    } else if (message.type === 'stream_event' && message.event) {
      this.handleStreamEvent(message.event);
    } else if (message.type === 'result') {
      // Handle result message (turn completion)
      this.emit({
        type: 'turn_end',
        stopReason: message.stop_reason || 'unknown',
        result: message.result,
        usage: message.usage
      });
    } else if (message.type === 'assistant') {
      // Handle final assistant message (non-streaming response)
      const content = message.message?.content || [];
      for (const block of content) {
        if (block.type === 'text') {
          this.emit({
            type: 'text_delta',
            delta: block.text
          });
        } else if (block.type === 'tool_use') {
          this.emit({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input
          });
        }
      }
    } else {
      this.emit({
        type: 'unknown_message',
        message
      });
    }
  }

  /**
   * Handle system messages (lifecycle events)
   */
  handleSystemMessage(message) {
    this.emit({
      type: 'system',
      subtype: message.subtype,
      data: message
    });
  }

  /**
   * Handle stream events (the actual content)
   */
  handleStreamEvent(event) {
    if (!event || typeof event !== 'object') return;

    const { type } = event;

    switch (type) {
      case 'message_start':
        if (event.message && typeof event.message.id === 'string') {
          this.currentMessageId = event.message.id;
        }
        this.emit({
          type: 'message_start',
          message: event.message,
          ttft_ms: event.ttft_ms
        });
        break;

      case 'content_block_start':
        this.handleContentBlockStart(event);
        break;

      case 'content_block_delta':
        this.handleContentBlockDelta(event);
        break;

      case 'content_block_stop':
        this.handleContentBlockStop(event);
        break;

      case 'message_delta':
        this.emit({
          type: 'message_delta',
          delta: event.delta,
          stopReason: event.delta?.stop_reason
        });
        break;

      case 'message_stop':
        this.emit({
          type: 'message_stop',
          stopReason: this.currentStopReason
        });
        break;

      default:
        this.emit({
          type: 'unknown_event',
          event
        });
    }
  }

  /**
   * Handle content block start
   */
  handleContentBlockStart(event) {
    const { index, content_block } = event;
    if (!content_block) return;

    const { type } = content_block;

    // Initialize block state with proper structure
    this.blockStates.set(index, {
      type,
      id: content_block.id,
      name: content_block.name,
      input: '', // For accumulating input_json_delta
      inputValue: 'input' in content_block ? content_block.input : undefined
    });

    if (type === 'tool_use') {
      this.emit({
        type: 'tool_use_start',
        index,
        id: content_block.id,
        name: content_block.name
      });
    } else {
      this.emit({
        type: 'content_block_start',
        index,
        blockType: type
      });
    }
  }

  /**
   * Handle content block delta
   */
  handleContentBlockDelta(event) {
    const { index, delta } = event;
    if (!delta) return;

    const { type } = delta;

    switch (type) {
      case 'text_delta':
        this.emit({
          type: 'text_delta',
          index,
          text: delta.text
        });
        break;

      case 'thinking_delta':
        this.emit({
          type: 'thinking_delta',
          index,
          thinking: delta.thinking
        });
        break;

      case 'input_json_delta': {
        // Accumulate partial JSON for tool input
        const blockState = this.blockStates.get(index);
        if (blockState && blockState.type === 'tool_use' && typeof delta.partial_json === 'string') {
          blockState.input += delta.partial_json;

          // Emit delta event for UI to show progress
          this.emit({
            type: 'tool_input_delta',
            index,
            partial: delta.partial_json
          });
        }
        break;
      }
    }
  }

  /**
   * Handle content block stop
   */
  handleContentBlockStop(event) {
    const { index } = event;
    const blockState = this.blockStates.get(index);

    if (blockState && blockState.type === 'tool_use') {
      // Try to parse accumulated input JSON
      let parsedInput = {};

      if (typeof blockState.id === 'string' && blockState.input.trim()) {
        try {
          parsedInput = JSON.parse(blockState.input);
          this.streamedToolUseIds.add(blockState.id);
        } catch (err) {
          // If JSON parsing fails, fall back to inputValue or empty object
          parsedInput = blockState.inputValue !== undefined ? blockState.inputValue : {};
        }
      } else if (blockState.inputValue !== undefined) {
        // No streaming input, use the initial value
        parsedInput = blockState.inputValue;
        if (typeof blockState.id === 'string') {
          this.streamedToolUseIds.add(blockState.id);
        }
      }

      // Emit final tool_use event
      this.emit({
        type: 'tool_use',
        index,
        id: blockState.id,
        name: blockState.name,
        input: parsedInput
      });
    }

    this.emit({
      type: 'content_block_stop',
      index
    });

    // Clean up block state
    this.blockStates.delete(index);
  }

  /**
   * Emit event to callback
   */
  emit(event) {
    try {
      this.onEvent(event);
    } catch (err) {
      console.error('Event handler error:', err);
    }
  }
}

export default ClaudeStreamHandler;
