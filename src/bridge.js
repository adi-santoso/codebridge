/**
 * CodeBridge - Main Bridge
 *
 * Coordinates WhatsApp client and Claude session manager
 */

import { WhatsAppClient } from './whatsapp/client.js';
import { MessageHandler } from './whatsapp/message-handler.js';
import { SessionManager } from './claude/session-manager.js';
import { Logger } from './utils/logger.js';

export class CodeBridge {
  constructor() {
    this.logger = new Logger('CodeBridge');
    this.whatsappClient = null;
    this.sessionManager = null;
    this.messageHandler = null;
    this.isRunning = false;
  }

  /**
   * Start the bridge
   */
  async start() {
    this.logger.info('Starting CodeBridge...');

    try {
      // Initialize session manager
      this.logger.info('Initializing Session Manager...');
      this.sessionManager = new SessionManager();

      // Initialize WhatsApp client
      this.logger.info('Initializing WhatsApp Client...');
      this.whatsappClient = new WhatsAppClient({
        onReady: () => this.onWhatsAppReady(),
        onMessage: (msg) => this.onWhatsAppMessage(msg)
      });

      await this.whatsappClient.initialize();

      // Initialize message handler
      this.messageHandler = new MessageHandler(
        this.sessionManager,
        this.whatsappClient
      );

      this.isRunning = true;
      this.logger.success('CodeBridge started successfully!');

    } catch (error) {
      this.logger.error('Failed to start CodeBridge:', error);
      throw error;
    }
  }

  /**
   * WhatsApp ready callback
   */
  async onWhatsAppReady() {
    const info = await this.whatsappClient.getInfo();
    this.logger.success('WhatsApp connected:', {
      phone: info.phone,
      platform: info.platform
    });
  }

  /**
   * WhatsApp message callback
   */
  async onWhatsAppMessage(message) {
    if (!this.messageHandler) return;

    try {
      await this.messageHandler.handleMessage(message);
    } catch (error) {
      this.logger.error('Error handling message:', error);
    }
  }

  /**
   * Stop the bridge
   */
  async stop() {
    this.logger.info('Stopping CodeBridge...');

    this.isRunning = false;

    // Close all Claude sessions
    if (this.sessionManager) {
      await this.sessionManager.closeAllSessions();
    }

    // Shutdown WhatsApp
    if (this.whatsappClient) {
      await this.whatsappClient.shutdown();
    }

    this.logger.success('CodeBridge stopped');
  }

  /**
   * Get bridge status
   */
  getStatus() {
    return {
      running: this.isRunning,
      whatsappReady: this.whatsappClient?.isReady || false,
      activeSessions: this.sessionManager?.getActiveSessionCount() || 0,
      activeUsers: this.sessionManager?.getActiveUsers() || []
    };
  }
}

export default CodeBridge;
