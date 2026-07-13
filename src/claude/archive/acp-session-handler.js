import { EventEmitter } from 'events';
import { JsonRpcChannel } from './json-rpc.js';

/**
 * ACP (Agent Client Protocol) Session Handler
 * Manages full lifecycle of ACP session: handshake, prompts, updates
 */

const ACP_PROTOCOL_VERSION = 1;
const DEFAULT_HANDSHAKE_TIMEOUT = 15000; // 15 seconds
const DEFAULT_PROMPT_TIMEOUT = 120000; // 2 minutes

export class AcpSessionHandler extends EventEmitter {
  constructor(options = {}) {
    super();

    this.child = options.child; // Child process (spawned Claude CLI)
    this.cwd = options.cwd;
    this.model = options.model || 'claude-3-5-sonnet-20241022';
    this.clientName = options.clientName || 'codebridge';
    this.clientVersion = options.clientVersion || '1.0.0';

    this.sessionId = null;
    this.rpc = new JsonRpcChannel();
    this.isReady = false;
    this.isClosed = false;

    // Response accumulator
    this.currentResponse = {
      text: '',
      thinking: [],
      toolsUsed: [],
      updates: []
    };

    this.setupRpcChannel();
  }

  /**
   * Setup JSON-RPC channel event listeners
   */
  setupRpcChannel() {
    // Forward RPC notifications to session handler
    this.rpc.on('notification', ({ method, params }) => {
      this.handleNotification(method, params);
    });

    // Forward RPC debug/error events
    this.rpc.on('debug', (msg) => this.emit('debug', `[RPC] ${msg}`));
    this.rpc.on('error', (err) => this.emit('error', err));
    this.rpc.on('warn', (msg) => this.emit('warn', `[RPC] ${msg}`));

    // Process stdout data
    if (this.child.stdout) {
      this.child.stdout.on('data', (data) => {
        this.rpc.processData(data);
      });
    }

    // Handle subprocess stderr (for debugging)
    if (this.child.stderr) {
      this.child.stderr.on('data', (data) => {
        const msg = data.toString();
        this.emit('stderr', msg);
        // Also log to console for debugging
        console.error('[STDERR]', msg);
      });
    }

    // Handle subprocess exit
    this.child.on('exit', (code, signal) => {
      this.handleProcessExit(code, signal);
    });

    this.child.on('error', (error) => {
      this.emit('error', new Error(`Subprocess error: ${error.message}`));
    });
  }

  /**
   * Initialize ACP session (handshake + session/new)
   * @returns {Promise<string>} - Session ID
   */
  async initialize() {
    if (this.isReady) {
      throw new Error('Session already initialized');
    }

    if (this.isClosed) {
      throw new Error('Session is closed');
    }

    try {
      // Step 1: Send initialize request
      this.emit('debug', 'Sending initialize request...');
      const initResult = await this.rpc.sendRequest(
        this.child.stdin,
        'initialize',
        {
          protocolVersion: ACP_PROTOCOL_VERSION,
          clientCapabilities: {
            terminal: false // We don't support terminal interaction
          },
          clientInfo: {
            name: this.clientName,
            version: this.clientVersion
          }
        },
        DEFAULT_HANDSHAKE_TIMEOUT
      );

      this.emit('debug', `Initialize response: ${JSON.stringify(initResult)}`);

      // Validate protocol version
      if (initResult.protocolVersion !== ACP_PROTOCOL_VERSION) {
        throw new Error(`Protocol version mismatch: expected ${ACP_PROTOCOL_VERSION}, got ${initResult.protocolVersion}`);
      }

      // Step 2: Send session/new request
      this.emit('debug', 'Sending session/new request...');
      const sessionResult = await this.rpc.sendRequest(
        this.child.stdin,
        'session/new',
        {
          cwd: this.cwd,
          mcpServers: [], // No MCP servers for now
          model: this.model
        },
        DEFAULT_HANDSHAKE_TIMEOUT
      );

      this.sessionId = sessionResult.sessionId;
      this.isReady = true;

      this.emit('debug', `Session created: ${this.sessionId}`);
      this.emit('ready', this.sessionId);

      return this.sessionId;
    } catch (error) {
      this.emit('error', new Error(`Failed to initialize session: ${error.message}`));
      throw error;
    }
  }

  /**
   * Send prompt to Claude and wait for response
   * @param {string} prompt - User prompt
   * @returns {Promise<object>} - Response object with text and metadata
   */
  async sendPrompt(prompt) {
    if (!this.isReady) {
      throw new Error('Session not ready. Call initialize() first.');
    }

    if (this.isClosed) {
      throw new Error('Session is closed');
    }

    // Reset response accumulator
    this.currentResponse = {
      text: '',
      thinking: [],
      toolsUsed: [],
      updates: []
    };

    try {
      this.emit('debug', `Sending prompt to session ${this.sessionId}...`);

      // Send session/prompt request
      const result = await this.rpc.sendRequest(
        this.child.stdin,
        'session/prompt',
        {
          sessionId: this.sessionId,
          prompt,
          allowedPrompts: [] // Auto-approve all tool uses for now
        },
        DEFAULT_PROMPT_TIMEOUT
      );

      this.emit('debug', `Prompt acknowledged: ${JSON.stringify(result)}`);

      // Wait for response to complete
      // Response comes via session/update notifications
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Prompt response timeout'));
        }, DEFAULT_PROMPT_TIMEOUT);

        // Listen for response completion
        const completeHandler = (response) => {
          clearTimeout(timeout);
          this.removeListener('prompt-complete', completeHandler);
          this.removeListener('error', errorHandler);
          resolve(response);
        };

        const errorHandler = (error) => {
          clearTimeout(timeout);
          this.removeListener('prompt-complete', completeHandler);
          this.removeListener('error', errorHandler);
          reject(error);
        };

        this.once('prompt-complete', completeHandler);
        this.once('error', errorHandler);
      });
    } catch (error) {
      this.emit('error', new Error(`Failed to send prompt: ${error.message}`));
      throw error;
    }
  }

  /**
   * Handle ACP notifications (session/update, etc)
   * @param {string} method - Notification method
   * @param {object} params - Notification parameters
   */
  handleNotification(method, params) {
    switch (method) {
      case 'session/update':
        this.handleSessionUpdate(params);
        break;

      case 'session/error':
        this.emit('error', new Error(`Session error: ${params.message || JSON.stringify(params)}`));
        break;

      default:
        this.emit('debug', `Unknown notification: ${method}`);
    }
  }

  /**
   * Handle session/update notification
   * Accumulates response text and metadata
   * @param {object} params - Update parameters
   */
  handleSessionUpdate(params) {
    const { sessionId, update } = params;

    if (sessionId !== this.sessionId) {
      this.emit('warn', `Received update for different session: ${sessionId}`);
      return;
    }

    if (!update) {
      this.emit('warn', 'Received session/update with no update object');
      return;
    }

    // Store raw update
    this.currentResponse.updates.push(update);

    // Extract update type
    const updateType = update.type || 'unknown';

    switch (updateType) {
      case 'text':
        // Accumulate response text
        if (update.text) {
          this.currentResponse.text += update.text;
          this.emit('text', update.text);
        }
        break;

      case 'thinking':
        // Store thinking steps (optional to show user)
        if (update.thinking) {
          this.currentResponse.thinking.push(update.thinking);
          this.emit('thinking', update.thinking);
        }
        break;

      case 'tool_use':
        // Track tool usage
        if (update.tool) {
          this.currentResponse.toolsUsed.push({
            tool: update.tool.name,
            input: update.tool.input,
            timestamp: Date.now()
          });
          this.emit('tool-use', update.tool);
        }
        break;

      case 'tool_result':
        // Tool execution result
        if (update.result) {
          this.emit('tool-result', update.result);
        }
        break;

      case 'error':
        // Error during execution
        this.emit('error', new Error(update.error || 'Unknown error in session/update'));
        break;

      case 'complete':
        // Response complete - emit accumulated response
        this.emit('debug', 'Response complete');
        this.emit('prompt-complete', {
          text: this.currentResponse.text,
          thinking: this.currentResponse.thinking,
          toolsUsed: this.currentResponse.toolsUsed
        });
        break;

      default:
        this.emit('debug', `Unknown update type: ${updateType}`);
    }
  }

  /**
   * Handle subprocess exit
   * @param {number} code - Exit code
   * @param {string} signal - Signal name
   */
  handleProcessExit(code, signal) {
    this.isClosed = true;
    this.isReady = false;

    this.emit('debug', `Subprocess exited: code=${code}, signal=${signal}`);

    if (code === 0) {
      this.emit('close', { code, signal, expected: true });
    } else if (code === 143) {
      // SIGTERM - the issue we're trying to fix
      this.emit('error', new Error(`Subprocess died with exit code 143 (SIGTERM)`));
      this.emit('close', { code, signal, expected: false });
    } else {
      this.emit('error', new Error(`Subprocess died with exit code ${code}`));
      this.emit('close', { code, signal, expected: false });
    }

    // Cleanup RPC channel
    this.rpc.cleanup();
  }

  /**
   * Close session gracefully
   */
  async close() {
    if (this.isClosed) {
      return;
    }

    this.emit('debug', 'Closing session...');

    try {
      // Try to close session gracefully
      if (this.sessionId && this.isReady) {
        await this.rpc.sendRequest(
          this.child.stdin,
          'session/close',
          { sessionId: this.sessionId },
          5000 // 5 second timeout for close
        );
      }
    } catch (error) {
      this.emit('warn', `Failed to close session gracefully: ${error.message}`);
    }

    // Kill subprocess
    if (this.child && !this.child.killed) {
      this.child.kill('SIGTERM');

      // Force kill after 2 seconds if still alive
      setTimeout(() => {
        if (!this.child.killed) {
          this.emit('warn', 'Subprocess did not exit, force killing...');
          this.child.kill('SIGKILL');
        }
      }, 2000);
    }

    this.isClosed = true;
    this.isReady = false;
    this.rpc.cleanup();
  }

  /**
   * Get session status
   */
  getStatus() {
    return {
      sessionId: this.sessionId,
      isReady: this.isReady,
      isClosed: this.isClosed,
      pendingRequests: this.rpc.getPendingCount(),
      pid: this.child ? this.child.pid : null
    };
  }
}

/**
 * Utility function to attach ACP session to spawned subprocess
 * Follows open-design pattern
 *
 * @param {object} options - Session options
 * @returns {Promise<AcpSessionHandler>} - Initialized session
 */
export async function attachAcpSession(options) {
  const session = new AcpSessionHandler(options);
  await session.initialize();
  return session;
}
