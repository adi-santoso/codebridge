import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { ClaudeStreamHandler } from './stream-handler.js';
import which from 'which';
import { readFileSync, realpathSync } from 'fs';
import { join } from 'path';
import os from 'os';

/**
 * Direct Claude CLI Spawner
 * Spawns Claude CLI subprocess directly with custom endpoint support
 */

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
const DEFAULT_SPAWN_TIMEOUT = 10000; // 10 seconds

export class DirectClaudeSpawner extends EventEmitter {
  constructor(options = {}) {
    super();

    this.apiKey = options.apiKey;
    this.customEndpoint = options.customEndpoint;
    this.projectPath = options.projectPath;
    this.model = options.model || DEFAULT_MODEL;

    // Session storage: userId -> session object
    this.sessions = new Map();
  }

  /**
   * Find Claude CLI executable path
   * @returns {Promise<string>} - Path to Claude CLI
   */
  async findClaudeCli() {
    try {
      // Try to find 'claude' in PATH
      let claudePath = await which('claude');

      // Resolve symlink to actual binary
      try {
        claudePath = realpathSync(claudePath);
        this.emit('debug', `Resolved Claude CLI symlink to: ${claudePath}`);
      } catch (err) {
        this.emit('debug', `Could not resolve symlink, using: ${claudePath}`);
      }

      return claudePath;
    } catch (error) {
      // Check common installation paths
      const commonPaths = [
        'C:\\Program Files\\Claude\\claude.exe',
        'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Programs\\Claude\\claude.exe',
        '/usr/local/bin/claude',
        '/opt/claude/bin/claude',
        '/home/deploy/.local/bin/claude',  // Add deploy user path
        '/home/deploy/.local/share/claude/versions/2.1.207'  // Direct binary path
      ];

      for (const path of commonPaths) {
        try {
          const { existsSync } = await import('fs');
          if (existsSync(path)) {
            // Try to resolve symlink
            let resolvedPath = path;
            try {
              resolvedPath = realpathSync(path);
              this.emit('debug', `Resolved ${path} to: ${resolvedPath}`);
            } catch (err) {
              // Use original path if can't resolve
            }

            this.emit('debug', `Found Claude CLI at: ${resolvedPath}`);
            return resolvedPath;
          }
        } catch (err) {
          // Continue checking
        }
      }

      throw new Error(
        'Claude CLI not found. Please install Claude Code CLI and ensure it is in your PATH. ' +
        'Visit: https://claude.ai/download'
      );
    }
  }

  /**
   * Load Claude CLI settings from ~/.claude/settings.json
   * @returns {object} - Settings object with env
   */
  loadClaudeSettings() {
    try {
      const settingsPath = join(os.homedir(), '.claude', 'settings.json');
      this.emit('debug', `Loading Claude settings from: ${settingsPath}`);
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      this.emit('debug', `Loaded settings with ${Object.keys(settings.env || {}).length} env variables`);
      return settings;
    } catch (error) {
      this.emit('debug', `Could not load Claude settings: ${error.message}`);
      return { env: {} };
    }
  }

  /**
   * Build environment variables for subprocess
   * Loads Claude CLI settings and merges with custom options
   * @returns {object} - Environment variables
   */
  buildEnvironment() {
    // Start with Claude CLI settings
    const claudeSettings = this.loadClaudeSettings();

    const env = {
      ...process.env,
      ...(claudeSettings.env || {}),  // Merge Claude CLI env settings
      NODE_ENV: 'development'
    };

    this.emit('debug', `Environment after settings.json merge:`);
    this.emit('debug', `  ANTHROPIC_AUTH_TOKEN: ${env.ANTHROPIC_AUTH_TOKEN ? '***set***' : 'NOT SET'}`);
    this.emit('debug', `  ANTHROPIC_BASE_URL: ${env.ANTHROPIC_BASE_URL || 'NOT SET'}`);
    this.emit('debug', `  ANTHROPIC_MODEL: ${env.ANTHROPIC_MODEL || 'NOT SET'}`);

    // Override with constructor options if provided (only if truthy)
    if (this.apiKey) {
      env.ANTHROPIC_AUTH_TOKEN = this.apiKey;
      this.emit('debug', `Overriding API key from constructor`);
    }

    if (this.customEndpoint) {
      env.ANTHROPIC_BASE_URL = this.customEndpoint;
      this.emit('debug', `Overriding endpoint: ${this.customEndpoint}`);
    }

    // Don't override model if using default - let settings.json value stay
    if (this.model && this.model !== DEFAULT_MODEL) {
      env.ANTHROPIC_MODEL = this.model;
      this.emit('debug', `Overriding model: ${this.model}`);
    }

    return env;
  }

  /**
   * Spawn Claude CLI subprocess
   * @param {string} cwd - Working directory
   * @param {string} model - Model to use (optional, uses CLI default if not provided)
   * @returns {Promise<ChildProcess>} - Spawned child process
   */
  async spawnClaudeProcess(cwd, model) {
    const claudePath = await this.findClaudeCli();
    const env = this.buildEnvironment();

    const args = ['--print'];

    // Only add --model if explicitly provided
    if (model && model !== DEFAULT_MODEL) {
      args.push(`--model=${model}`);
      this.emit('debug', `Spawning Claude CLI: ${claudePath} --print --model=${model}`);
    } else {
      this.emit('debug', `Spawning Claude CLI: ${claudePath} --print (using CLI default model)`);
    }

    args.push(
      '--input-format=stream-json',
      '--output-format=stream-json',
      '--verbose',
      '--dangerously-skip-permissions'
    );

    this.emit('debug', `Working directory: ${cwd}`);

    const child = spawn(claudePath, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false, // Disable shell, use absolute path instead
      windowsHide: false // Show window for debugging (can be true in production)
    });

    // Wait for spawn to complete
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Claude CLI spawn timeout'));
      }, DEFAULT_SPAWN_TIMEOUT);

      child.once('spawn', () => {
        clearTimeout(timeout);
        this.emit('debug', `Claude CLI spawned: PID=${child.pid}`);
        resolve(child);
      });

      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn Claude CLI: ${error.message}`));
      });
    });
  }

  /**
   * Create new Claude session for user
   * @param {string} userId - User identifier
   * @param {object} options - Session options
   * @returns {Promise<object>} - Initialized session
   */
  async createSession(userId, options = {}) {
    // Check if session already exists
    if (this.sessions.has(userId)) {
      this.emit('debug', `Reusing existing session for user: ${userId}`);
      return this.sessions.get(userId);
    }

    try {
      const cwd = options.cwd || this.projectPath;
      const model = options.model || this.model;

      if (!cwd) {
        throw new Error('Project path (cwd) is required');
      }

      this.emit('debug', `Creating new session for user: ${userId}`);

      // Step 1: Spawn subprocess
      const child = await this.spawnClaudeProcess(cwd, model);

      // Step 2: Create stream handler
      const handler = new ClaudeStreamHandler({
        onEvent: (event) => this.handleStreamEvent(userId, event)
      });

      // Step 3: Wire up stdio
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => handler.feed(chunk));

      child.stderr.on('data', (data) => {
        this.emit('stderr', { userId, data: data.toString() });
      });

      child.on('close', (code, signal) => {
        this.emit('debug', `Session closed for user ${userId}: code=${code}, signal=${signal}`);
        this.sessions.delete(userId);
        this.emit('session-closed', { userId, code, signal });
      });

      // Step 4: Create session object
      const session = {
        userId,
        child,
        handler,
        model,
        isReady: true,
        isClosed: false,

        // Helper methods
        sendPrompt: (text) => this.sendPrompt(userId, text),
        sendToolResult: (toolUseId, content, isError) =>
          this.sendToolResult(userId, toolUseId, content, isError),
        close: () => this.closeSession(userId)
      };

      // Store session
      this.sessions.set(userId, session);

      this.emit('session-created', { userId });

      return session;
    } catch (error) {
      this.emit('error', { userId, error });
      throw error;
    }
  }

  /**
   * Get existing session or create new one
   * @param {string} userId - User identifier
   * @param {object} options - Session options
   * @returns {Promise<AcpSessionHandler>} - Session handler
   */
  async getOrCreateSession(userId, options = {}) {
    const existing = this.sessions.get(userId);

    if (existing && existing.isReady && !existing.isClosed) {
      return existing;
    }

    // Session doesn't exist or is not ready - create new one
    if (existing) {
      this.emit('debug', `Existing session for ${userId} is not ready, creating new one`);
      await this.closeSession(userId);
    }

    return this.createSession(userId, options);
  }

  /**
   * Send message to user's session
   * @param {string} userId - User identifier
   * @param {string} prompt - Message prompt
   * @param {object} options - Session options (for creation if needed)
   * @returns {Promise<void>}
   */
  async sendMessage(userId, prompt, options = {}) {
    try {
      const session = await this.getOrCreateSession(userId, options);
      return session.sendPrompt(prompt);
    } catch (error) {
      this.emit('error', { userId, error });
      throw error;
    }
  }

  /**
   * Send prompt to user's session
   * @param {string} userId - User identifier
   * @param {string} text - Prompt text
   */
  sendPrompt(userId, text) {
    const session = this.sessions.get(userId);
    if (!session || session.isClosed) {
      throw new Error(`No active session for user ${userId}`);
    }

    const message = {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text }]
      }
    };

    session.child.stdin.write(JSON.stringify(message) + '\n');
    this.emit('prompt-sent', { userId, text });
  }

  /**
   * Send tool result to user's session
   * @param {string} userId - User identifier
   * @param {string} toolUseId - Tool use ID
   * @param {string} content - Result content
   * @param {boolean} isError - Whether result is an error
   */
  sendToolResult(userId, toolUseId, content, isError = false) {
    const session = this.sessions.get(userId);
    if (!session || session.isClosed) {
      throw new Error(`No active session for user ${userId}`);
    }

    const message = {
      type: 'user',
      message: {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: String(content),
          is_error: isError
        }]
      }
    };

    session.child.stdin.write(JSON.stringify(message) + '\n');
    this.emit('tool-result-sent', { userId, toolUseId });
  }

  /**
   * Handle stream events from ClaudeStreamHandler
   * @param {string} userId - User identifier
   * @param {object} event - Stream event
   */
  handleStreamEvent(userId, event) {
    // Route events to appropriate emitters
    switch (event.type) {
      case 'text_delta':
        this.emit('text', { userId, text: event.delta });
        break;

      case 'thinking_delta':
        this.emit('thinking', { userId, thinking: event.delta });
        break;

      case 'tool_use':
        this.emit('tool-use', { userId, tool: event });
        break;

      case 'turn_end':
        this.emit('turn-end', { userId, stopReason: event.stopReason });
        break;

      case 'usage':
        this.emit('usage', { userId, usage: event });
        break;

      case 'error':
        this.emit('error', { userId, error: new Error(event.message) });
        break;

      case 'status':
        this.emit('debug', `[${userId}] Status: ${event.label}`);
        break;

      default:
        this.emit('debug', `[${userId}] Unknown event type: ${event.type}`);
        this.emit('debug', `[${userId}] Event data: ${JSON.stringify(event)}`);
    }
  }

  /**
   * Close session for user
   * @param {string} userId - User identifier
   */
  async closeSession(userId) {
    const session = this.sessions.get(userId);

    if (!session) {
      this.emit('debug', `No session to close for user: ${userId}`);
      return;
    }

    try {
      // Mark as closed
      session.isClosed = true;

      // Kill child process
      if (session.child && !session.child.killed) {
        session.child.kill('SIGTERM');

        // Force kill after timeout
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            if (!session.child.killed) {
              session.child.kill('SIGKILL');
            }
            resolve();
          }, 2000);

          session.child.once('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }

      this.sessions.delete(userId);
      this.emit('debug', `Session closed for user: ${userId}`);
    } catch (error) {
      this.emit('warn', `Failed to close session for ${userId}: ${error.message}`);
      this.sessions.delete(userId);
    }
  }

  /**
   * Close all sessions
   */
  async closeAll() {
    this.emit('debug', `Closing all sessions (${this.sessions.size})...`);

    const closePromises = Array.from(this.sessions.keys()).map(userId =>
      this.closeSession(userId).catch(err =>
        this.emit('warn', `Failed to close session ${userId}: ${err.message}`)
      )
    );

    await Promise.all(closePromises);
    this.emit('debug', 'All sessions closed');
  }

  /**
   * Get session status for user
   * @param {string} userId - User identifier
   * @returns {object|null} - Session status or null if not found
   */
  getSessionStatus(userId) {
    const session = this.sessions.get(userId);
    if (!session) return null;

    return {
      userId: session.userId,
      model: session.model,
      isReady: session.isReady,
      isClosed: session.isClosed,
      pid: session.child.pid
    };
  }

  /**
   * Get all active sessions
   * @returns {Array} - Array of session info
   */
  getAllSessions() {
    return Array.from(this.sessions.entries()).map(([userId, session]) => ({
      userId,
      model: session.model,
      isReady: session.isReady,
      isClosed: session.isClosed,
      pid: session.child.pid
    }));
  }

  /**
   * Cleanup all sessions (alias for closeAll)
   */
  async cleanup() {
    return this.closeAll();
  }

  /**
   * Health check - test if Claude CLI is available and working
   * @returns {Promise<object>} - Health check result
   */
  async healthCheck() {
    try {
      const claudePath = await this.findClaudeCli();

      return {
        healthy: true,
        claudePath,
        customEndpoint: this.customEndpoint,
        activeSessions: this.sessions.size
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        activeSessions: this.sessions.size
      };
    }
  }
}
