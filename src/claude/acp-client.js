/**
 * Claude Agent ACP Client
 *
 * Manages claude-agent-acp subprocess and JSON-RPC communication
 *
 * This is the CORE component that wraps claude-agent-acp subprocess
 * and provides clean async API for session management.
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';
import path from 'path';
import { Logger } from '../utils/logger.js';
import config from '../utils/config.js';

export class ACPClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || config.claude.apiKey;
    this.baseUrl = options.baseUrl || config.claude.baseUrl;
    this.logger = new Logger('ACPClient');

    this.agent = null;
    this.rl = null;
    this.requestId = 1;
    this.pendingRequests = new Map();
    this.notifications = [];  // Store notifications for current request
    this.isInitialized = false;
  }

  /**
   * Spawn claude-agent-acp subprocess
   */
  async spawn() {
    this.logger.info('Spawning claude-agent-acp subprocess...');

    // Run the actual JS file directly with node
    const scriptPath = path.join(
      process.cwd(),
      'node_modules',
      '@agentclientprotocol',
      'claude-agent-acp',
      'dist',
      'index.js'
    );

    this.agent = spawn('node', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: this.apiKey,
        ANTHROPIC_BASE_URL: this.baseUrl,
        NODE_ENV: 'development'
      }
    });

    // Setup readline for NDJSON parsing
    this.rl = createInterface({
      input: this.agent.stdout,
      crlfDelay: Infinity
    });

    // Handle responses
    this.rl.on('line', (line) => {
      // RAW LOG: Print every line received
      console.log('🔍 RAW LINE:', line);

      try {
        const response = JSON.parse(line);
        this.logger.debug('Received:', response);

        // Handle notifications (no id field) - AI streaming responses
        if (!response.id && response.method) {
          this.logger.debug('Notification:', response.method);
          this.notifications.push(response);

          // If this looks like a completion notification, resolve the pending request
          if (response.method === 'session/update' && this.pendingRequests.size > 0) {
            // Find the most recent pending request
            const entries = Array.from(this.pendingRequests.entries());
            if (entries.length > 0) {
              const [id, pending] = entries[entries.length - 1];

              // Return notifications as result
              pending.resolve({
                result: {
                  notifications: [...this.notifications]
                }
              });

              this.pendingRequests.delete(id);
              this.notifications = [];  // Clear for next request
            }
          }
          return;
        }

        // Resolve pending request with actual response
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          if (response.error) {
            pending.reject(new Error(response.error.message || 'Unknown error'));
          } else {
            // Include any notifications received before this response
            if (this.notifications.length > 0) {
              response.notifications = [...this.notifications];
              this.notifications = [];
            }
            pending.resolve(response);
          }
          this.pendingRequests.delete(response.id);
        }
      } catch (e) {
        this.logger.error('Failed to parse response:', line);
      }
    });

    // Handle stderr
    this.agent.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      console.error('🔴 STDERR:', msg);
      this.logger.error('STDERR:', msg);
    });

    // Handle process errors
    this.agent.on('error', (error) => {
      this.logger.error('Process error:', error);
    });

    // Handle process exit
    this.agent.on('exit', (code, signal) => {
      this.logger.warn(`Agent exited: code=${code}, signal=${signal}`);
      this.isInitialized = false;
    });

    // Wait for subprocess to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Initialize agent
    await this.initialize();

    this.logger.success('Agent spawned and initialized');
  }

  /**
   * Initialize agent with protocol version
   */
  async initialize() {
    this.logger.info('Initializing agent...');

    const result = await this.sendRequest('initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true
        }
      }
    });

    this.isInitialized = true;
    this.logger.success('Agent initialized:', result.result?.agentInfo);
    return result;
  }

  /**
   * Create new session
   *
   * @param {Object} options - Session options
   * @param {string} options.cwd - Working directory
   * @param {string} options.model - Model name (optional)
   * @param {string} options.mode - Permission mode (optional)
   * @returns {Promise<string>} Session ID
   */
  async createSession(options = {}) {
    if (!this.isInitialized) {
      throw new Error('Agent not initialized. Call spawn() first.');
    }

    const {
      cwd = config.project.defaultCwd,
      model = config.claude.model,
      mode = config.session.defaultMode
    } = options;

    this.logger.info('Creating session...', { cwd, model, mode });

    const result = await this.sendRequest('session/new', {
      cwd,
      mcpServers: [],
      mode,
      model
    });

    const sessionId = result.result?.sessionId;
    if (!sessionId) {
      throw new Error('Failed to get session ID');
    }

    this.logger.success('Session created:', sessionId);
    return sessionId;
  }

  /**
   * Send prompt to session
   *
   * @param {string} sessionId - Session ID
   * @param {string} text - Prompt text
   * @returns {Promise<Object>} Response
   */
  async sendPrompt(sessionId, text) {
    if (!this.isInitialized) {
      throw new Error('Agent not initialized. Call spawn() first.');
    }

    this.logger.info('Sending prompt to session:', sessionId);
    this.logger.debug('Prompt:', text);

    const result = await this.sendRequest('session/prompt', {
      sessionId,
      prompt: [{
        type: 'text',
        text
      }]
    });

    this.logger.success('Prompt sent successfully');
    return result;
  }

  /**
   * Close session
   *
   * @param {string} sessionId - Session ID
   */
  async closeSession(sessionId) {
    if (!this.isInitialized) {
      return;
    }

    this.logger.info('Closing session:', sessionId);

    try {
      await this.sendRequest('session/close', { sessionId });
      this.logger.success('Session closed');
    } catch (e) {
      this.logger.warn('Failed to close session:', e.message);
    }
  }

  /**
   * Send JSON-RPC request
   *
   * @private
   */
  async sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.logger.debug('Sending request:', request);

      try {
        this.agent.stdin.write(JSON.stringify(request) + '\n');
      } catch (e) {
        reject(new Error(`Failed to write to stdin: ${e.message}`));
        return;
      }

      this.pendingRequests.set(id, { resolve, reject });

      // Timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${id} (${method}) timed out after ${config.session.timeout}ms`));
        }
      }, config.session.timeout);
    });
  }

  /**
   * Shutdown agent subprocess
   */
  async shutdown() {
    this.logger.info('Shutting down agent...');

    if (this.agent) {
      this.agent.kill();
      this.agent = null;
    }

    this.isInitialized = false;
    this.pendingRequests.clear();

    this.logger.success('Agent shut down');
  }
}

export default ACPClient;
