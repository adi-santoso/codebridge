import { EventEmitter } from 'events';

/**
 * JSON-RPC 2.0 Communication Layer for ACP
 * Handles low-level stdin/stdout communication with Claude CLI subprocess
 */

export class JsonRpcChannel extends EventEmitter {
  constructor() {
    super();
    this.pendingRequests = new Map();
    this.nextId = 1;
    this.buffer = '';
  }

  /**
   * Send JSON-RPC request to subprocess stdin
   * @param {WritableStream} stdin - Subprocess stdin
   * @param {string} method - JSON-RPC method name
   * @param {object} params - Method parameters
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise} - Resolves with response, rejects on timeout/error
   */
  sendRequest(stdin, method, params = {}, timeoutMs = 30000) {
    if (!stdin || stdin.destroyed) {
      return Promise.reject(new Error('stdin is null or destroyed'));
    }

    const id = this.nextId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      // Setup timeout
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} (id=${id}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Store pending request
      this.pendingRequests.set(id, {
        method,
        resolve,
        reject,
        timer
      });

      // Send request
      try {
        const line = JSON.stringify(request) + '\n';
        console.log(`[JSON-RPC] → Sending: ${line.trim()}`);
        const written = stdin.write(line);

        if (!written) {
          // Backpressure - wait for drain
          stdin.once('drain', () => {
            this.emit('debug', `Request ${method} (id=${id}) sent after drain`);
          });
        } else {
          this.emit('debug', `Request ${method} (id=${id}) sent`);
        }
      } catch (error) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(new Error(`Failed to send request ${method}: ${error.message}`));
      }
    });
  }

  /**
   * Send JSON-RPC notification (no response expected)
   * @param {WritableStream} stdin - Subprocess stdin
   * @param {string} method - JSON-RPC method name
   * @param {object} params - Method parameters
   */
  sendNotification(stdin, method, params = {}) {
    if (!stdin || stdin.destroyed) {
      throw new Error('stdin is null or destroyed');
    }

    const notification = {
      jsonrpc: '2.0',
      method,
      params
    };

    try {
      const line = JSON.stringify(notification) + '\n';
      stdin.write(line);
      this.emit('debug', `Notification ${method} sent`);
    } catch (error) {
      this.emit('error', new Error(`Failed to send notification ${method}: ${error.message}`));
    }
  }

  /**
   * Process data from subprocess stdout
   * Handles line buffering and JSON parsing
   * @param {Buffer|string} data - Data from stdout
   */
  processData(data) {
    this.buffer += data.toString();

    // Process complete lines
    let newlineIndex;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (line.length === 0) continue;

      console.log(`[JSON-RPC] ← Received: ${line}`);

      try {
        const message = JSON.parse(line);
        this.emit('debug', `← Received: ${JSON.stringify(message)}`);
        this.handleMessage(message);
      } catch (error) {
        this.emit('error', new Error(`Failed to parse JSON: ${error.message}\nLine: ${line}`));
      }
    }
  }

  /**
   * Handle parsed JSON-RPC message
   * Distinguishes between response and notification
   * @param {object} message - Parsed JSON message
   */
  handleMessage(message) {
    // System messages (hooks, debug info from --verbose flag) - ignore
    if (message.type === 'system') {
      this.emit('debug', `[System] ${message.subtype || 'unknown'}: ${JSON.stringify(message)}`);
      return;
    }

    // JSON-RPC response (has id)
    if ('id' in message) {
      this.handleResponse(message);
    }
    // JSON-RPC notification (has method, no id)
    else if ('method' in message) {
      this.handleNotification(message);
    }
    else {
      this.emit('error', new Error(`Invalid JSON-RPC message: ${JSON.stringify(message)}`));
    }
  }

  /**
   * Handle JSON-RPC response
   * @param {object} response - Response message
   */
  handleResponse(response) {
    const { id, result, error } = response;
    const pending = this.pendingRequests.get(id);

    if (!pending) {
      this.emit('warn', `Received response for unknown request id=${id}`);
      return;
    }

    // Clear timeout
    clearTimeout(pending.timer);
    this.pendingRequests.delete(id);

    // Handle error response
    if (error) {
      this.emit('debug', `Request ${pending.method} (id=${id}) failed: ${error.message || JSON.stringify(error)}`);
      pending.reject(new Error(error.message || JSON.stringify(error)));
    }
    // Handle success response
    else {
      this.emit('debug', `Request ${pending.method} (id=${id}) succeeded`);
      pending.resolve(result);
    }
  }

  /**
   * Handle JSON-RPC notification
   * @param {object} notification - Notification message
   */
  handleNotification(notification) {
    const { method, params } = notification;
    this.emit('notification', { method, params });
    this.emit('debug', `Notification received: ${method}`);
  }

  /**
   * Cleanup all pending requests
   * Called when subprocess dies or session closes
   */
  cleanup() {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Session closed, request ${pending.method} (id=${id}) cancelled`));
    }
    this.pendingRequests.clear();
    this.buffer = '';
  }

  /**
   * Get number of pending requests (for debugging)
   */
  getPendingCount() {
    return this.pendingRequests.size;
  }
}

/**
 * Utility functions for common JSON-RPC operations
 */

/**
 * Create a properly formatted JSON-RPC request object
 * @param {number} id - Request ID
 * @param {string} method - Method name
 * @param {object} params - Parameters
 * @returns {object} - JSON-RPC request
 */
export function createRequest(id, method, params = {}) {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params
  };
}

/**
 * Create a properly formatted JSON-RPC notification object
 * @param {string} method - Method name
 * @param {object} params - Parameters
 * @returns {object} - JSON-RPC notification
 */
export function createNotification(method, params = {}) {
  return {
    jsonrpc: '2.0',
    method,
    params
  };
}

/**
 * Check if message is a valid JSON-RPC response
 * @param {object} message - Message to validate
 * @returns {boolean}
 */
export function isResponse(message) {
  return message && 'id' in message && ('result' in message || 'error' in message);
}

/**
 * Check if message is a valid JSON-RPC notification
 * @param {object} message - Message to validate
 * @returns {boolean}
 */
export function isNotification(message) {
  return message && 'method' in message && !('id' in message);
}
