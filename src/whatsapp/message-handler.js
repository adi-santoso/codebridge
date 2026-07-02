/**
 * Message Handler
 *
 * Routes WhatsApp messages to appropriate Claude sessions
 *
 * Flow:
 * 1. Receive WhatsApp message
 * 2. Extract user ID (phone number)
 * 3. Get or create Claude session for user
 * 4. Send message to Claude
 * 5. Return response to WhatsApp
 */

import { Logger } from '../utils/logger.js';

export class MessageHandler {
  constructor(sessionManager, whatsappClient) {
    this.sessionManager = sessionManager;
    this.whatsappClient = whatsappClient;
    this.logger = new Logger('MessageHandler');

    // Command prefix (optional)
    this.commandPrefix = '/';
  }

  /**
   * Handle incoming WhatsApp message
   *
   * @param {Object} message - WhatsApp message object
   */
  async handleMessage(message) {
    // Ignore group messages (optional)
    if (message.from.includes('@g.us')) {
      this.logger.debug('Ignoring group message');
      return;
    }

    // Ignore messages from self
    if (message.fromMe) {
      this.logger.debug('Ignoring message from self');
      return;
    }

    const userId = message.from; // Phone number with @c.us
    const text = message.body.trim();

    // Handle commands
    if (text.startsWith(this.commandPrefix)) {
      await this.handleCommand(userId, text);
      return;
    }

    // Handle regular message -> send to Claude
    await this.handleClaudeMessage(userId, text);
  }

  /**
   * Handle command message
   *
   * Commands:
   * - /start - Start new session
   * - /reset - Reset session
   * - /help - Show help
   */
  async handleCommand(userId, text) {
    const command = text.split(' ')[0].toLowerCase();

    this.logger.info('Command received:', { userId, command });

    try {
      switch (command) {
        case '/start':
          await this.handleStartCommand(userId);
          break;

        case '/reset':
          await this.handleResetCommand(userId);
          break;

        case '/help':
          await this.handleHelpCommand(userId);
          break;

        default:
          await this.whatsappClient.sendMessage(
            userId,
            `Unknown command: ${command}\n\nType /help for available commands.`
          );
      }
    } catch (error) {
      this.logger.error('Command error:', error);
      await this.whatsappClient.sendMessage(
        userId,
        '❌ Error processing command. Please try again.'
      );
    }
  }

  /**
   * Handle /start command
   */
  async handleStartCommand(userId) {
    await this.whatsappClient.sendMessage(
      userId,
      '👋 Welcome to CodeBridge!\n\n' +
      'I\'m your AI coding assistant powered by Claude.\n\n' +
      'Just send me your coding questions or tasks, and I\'ll help you!\n\n' +
      'Commands:\n' +
      '/help - Show this message\n' +
      '/reset - Start fresh session'
    );
  }

  /**
   * Handle /reset command
   */
  async handleResetCommand(userId) {
    if (this.sessionManager.hasSession(userId)) {
      await this.sessionManager.closeSession(userId);
      await this.whatsappClient.sendMessage(
        userId,
        '🔄 Session reset. Starting fresh!'
      );
    } else {
      await this.whatsappClient.sendMessage(
        userId,
        'No active session to reset.'
      );
    }
  }

  /**
   * Handle /help command
   */
  async handleHelpCommand(userId) {
    await this.whatsappClient.sendMessage(
      userId,
      '📖 *CodeBridge Help*\n\n' +
      '*How to use:*\n' +
      'Just send me any coding question or task!\n\n' +
      '*Commands:*\n' +
      '/start - Welcome message\n' +
      '/reset - Reset your session\n' +
      '/help - Show this help\n\n' +
      '*Examples:*\n' +
      '• "Create a React component for a login form"\n' +
      '• "Explain how async/await works in JavaScript"\n' +
      '• "Debug this code: [paste code]"'
    );
  }

  /**
   * Handle regular message -> route to Claude
   */
  async handleClaudeMessage(userId, text) {
    this.logger.info('Routing to Claude:', { userId });

    // Show typing indicator
    await this.whatsappClient.sendTyping(userId);

    try {
      // Get or create session
      if (!this.sessionManager.hasSession(userId)) {
        this.logger.info('Creating new session for user:', userId);
        await this.sessionManager.getOrCreateSession(userId);
      }

      // Send to Claude
      this.logger.info('Sending to Claude...');
      const response = await this.sessionManager.sendMessage(userId, text);

      // Extract response text from notifications
      const responseText = this.extractResponseText(response);

      if (!responseText) {
        throw new Error('No response from Claude');
      }

      // Send back to WhatsApp
      await this.whatsappClient.sendMessage(userId, responseText);

      this.logger.success('Response sent to user');

    } catch (error) {
      this.logger.error('Error handling Claude message:', error);

      await this.whatsappClient.sendMessage(
        userId,
        '❌ Sorry, I encountered an error processing your request.\n\n' +
        'Error: ' + error.message + '\n\n' +
        'Please try again or use /reset to start fresh.'
      );
    }
  }

  /**
   * Extract response text from Claude notifications
   *
   * @param {Object} response - Claude response with notifications
   * @returns {string} Response text
   */
  extractResponseText(response) {
    // Check if response has notifications
    if (!response.notifications || response.notifications.length === 0) {
      return null;
    }

    // Find session/update notifications with text content
    const textParts = [];

    for (const notification of response.notifications) {
      if (notification.method === 'session/update' && notification.params) {
        // Look for text in updates
        const updates = notification.params.updates || [];

        for (const update of updates) {
          if (update.type === 'text' && update.content) {
            textParts.push(update.content);
          }
        }
      }
    }

    return textParts.join('\n').trim();
  }
}

export default MessageHandler;
