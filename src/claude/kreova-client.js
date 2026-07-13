import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';

/**
 * Kreova Client - Direct HTTP communication with Kreova endpoint
 * Replaces subprocess approach with stable SDK
 */

const DEFAULT_MODEL = 'kiro-claude-sonnet-4.5';
const DEFAULT_MAX_TOKENS = 4096;
const MAX_CONVERSATION_HISTORY = 20; // Keep last 20 messages per user

export class KreovaClient extends EventEmitter {
  constructor(options = {}) {
    super();

    this.apiKey = options.apiKey;
    this.baseURL = options.baseURL;
    this.model = options.model || DEFAULT_MODEL;
    this.maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;

    // Initialize Anthropic SDK client
    // NOTE: For Kreova endpoint, we need to explicitly set headers
    this.client = new Anthropic({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
      defaultHeaders: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });

    // Per-user conversation history: userId -> messages[]
    this.conversations = new Map();

    this.emit('debug', `KreovaClient initialized: ${this.baseURL}`);
  }

  /**
   * Get conversation history for user
   * @param {string} userId - User identifier
   * @returns {Array} - Message history
   */
  getConversation(userId) {
    if (!this.conversations.has(userId)) {
      this.conversations.set(userId, []);
    }
    return this.conversations.get(userId);
  }

  /**
   * Add message to conversation history
   * Maintains max history size
   * @param {string} userId - User identifier
   * @param {object} message - Message object {role, content}
   */
  addMessage(userId, message) {
    const messages = this.getConversation(userId);
    messages.push(message);

    // Trim history if too long (keep recent messages)
    if (messages.length > MAX_CONVERSATION_HISTORY) {
      messages.splice(0, messages.length - MAX_CONVERSATION_HISTORY);
      this.emit('debug', `Trimmed conversation for ${userId} to ${MAX_CONVERSATION_HISTORY} messages`);
    }
  }

  /**
   * Clear conversation history for user
   * @param {string} userId - User identifier
   */
  clearConversation(userId) {
    this.conversations.delete(userId);
    this.emit('debug', `Cleared conversation for ${userId}`);
  }

  /**
   * Send message to Kreova endpoint
   * @param {string} userId - User identifier
   * @param {string} prompt - User message
   * @param {object} options - Optional settings
   * @returns {Promise<object>} - Response object
   */
  async sendMessage(userId, prompt, options = {}) {
    try {
      this.emit('debug', `Sending message from ${userId}`);
      this.emit('message-start', { userId, prompt });

      // Get conversation history
      const messages = this.getConversation(userId);

      // Add user message to history
      this.addMessage(userId, {
        role: 'user',
        content: prompt
      });

      // Prepare API request
      const requestParams = {
        model: options.model || this.model,
        max_tokens: options.maxTokens || this.maxTokens,
        messages: [...messages] // Send full conversation
      };

      // Add system prompt if provided
      if (options.systemPrompt) {
        requestParams.system = options.systemPrompt;
      }

      // Call Kreova API via Anthropic SDK
      const startTime = Date.now();
      const response = await this.client.messages.create(requestParams);
      const duration = Date.now() - startTime;

      this.emit('debug', `Response received in ${duration}ms`);

      // Extract assistant response
      const assistantContent = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      // Add assistant response to history
      this.addMessage(userId, {
        role: 'assistant',
        content: assistantContent
      });

      // Build response object
      const result = {
        text: assistantContent,
        model: response.model,
        usage: response.usage,
        stopReason: response.stop_reason,
        conversationLength: messages.length,
        responseTime: duration
      };

      this.emit('message-complete', { userId, result });

      return result;

    } catch (error) {
      this.emit('error', { userId, error });
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  /**
   * Get conversation status for user
   * @param {string} userId - User identifier
   * @returns {object} - Status object
   */
  getStatus(userId) {
    const messages = this.conversations.get(userId);
    return {
      userId,
      hasConversation: messages && messages.length > 0,
      messageCount: messages ? messages.length : 0,
      endpoint: this.baseURL,
      model: this.model
    };
  }

  /**
   * Get all active users with conversations
   * @returns {Array} - Array of user IDs
   */
  getActiveUsers() {
    return Array.from(this.conversations.keys());
  }

  /**
   * Health check - verify endpoint is reachable
   * @returns {Promise<object>} - Health status
   */
  async healthCheck() {
    try {
      // Send minimal request to test connectivity
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }]
      });

      return {
        healthy: true,
        endpoint: this.baseURL,
        model: this.model,
        responseReceived: true,
        activeUsers: this.conversations.size
      };
    } catch (error) {
      return {
        healthy: false,
        endpoint: this.baseURL,
        error: error.message,
        activeUsers: this.conversations.size
      };
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.emit('debug', 'Cleaning up KreovaClient...');
    this.conversations.clear();
    this.removeAllListeners();
  }
}
