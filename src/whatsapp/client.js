/**
 * WhatsApp Client
 *
 * Manages WhatsApp connection using whatsapp-web.js
 *
 * Provides:
 * - QR code authentication
 * - Message receiving
 * - Message sending
 * - Connection state management
 */

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { Logger } from '../utils/logger.js';

export class WhatsAppClient {
  constructor(options = {}) {
    this.logger = new Logger('WhatsApp');
    this.messageHandler = options.onMessage || (() => {});
    this.readyHandler = options.onReady || (() => {});

    this.client = null;
    this.isReady = false;
  }

  /**
   * Initialize WhatsApp client
   */
  async initialize() {
    this.logger.info('Initializing WhatsApp client...');

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: '.wwebjs_auth'
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });

    // Setup event handlers
    this.setupEventHandlers();

    // Initialize client
    await this.client.initialize();

    this.logger.success('WhatsApp client initialized');
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    // QR Code for authentication
    this.client.on('qr', (qr) => {
      this.logger.info('Scan QR code to authenticate:');
      qrcode.generate(qr, { small: true });
    });

    // Ready
    this.client.on('ready', () => {
      this.isReady = true;
      this.logger.success('WhatsApp client ready!');
      this.readyHandler();
    });

    // Authenticated
    this.client.on('authenticated', () => {
      this.logger.success('WhatsApp authenticated');
    });

    // Authentication failure
    this.client.on('auth_failure', (msg) => {
      this.logger.error('Authentication failed:', msg);
    });

    // Disconnected
    this.client.on('disconnected', (reason) => {
      this.isReady = false;
      this.logger.warn('WhatsApp disconnected:', reason);
    });

    // Incoming messages
    this.client.on('message', async (message) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        this.logger.error('Error handling message:', error);
      }
    });
  }

  /**
   * Handle incoming message
   */
  async handleMessage(message) {
    // Log incoming message
    this.logger.info('Received message:', {
      from: message.from,
      body: message.body.substring(0, 50) + (message.body.length > 50 ? '...' : '')
    });

    // Call external handler
    await this.messageHandler(message);
  }

  /**
   * Send message to WhatsApp
   *
   * @param {string} chatId - Chat ID (phone number with @c.us)
   * @param {string} text - Message text
   */
  async sendMessage(chatId, text) {
    if (!this.isReady) {
      throw new Error('WhatsApp client not ready');
    }

    this.logger.info('Sending message to:', chatId);
    this.logger.debug('Message:', text.substring(0, 100));

    try {
      await this.client.sendMessage(chatId, text);
      this.logger.success('Message sent');
    } catch (error) {
      this.logger.error('Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Send typing indicator
   *
   * @param {string} chatId - Chat ID
   */
  async sendTyping(chatId) {
    if (!this.isReady) return;

    try {
      const chat = await this.client.getChatById(chatId);
      await chat.sendStateTyping();
    } catch (error) {
      this.logger.warn('Failed to send typing indicator:', error);
    }
  }

  /**
   * Get client info
   */
  async getInfo() {
    if (!this.isReady) {
      return { ready: false };
    }

    const info = this.client.info;
    return {
      ready: true,
      phone: info.wid.user,
      platform: info.platform,
      pushname: info.pushname
    };
  }

  /**
   * Shutdown client
   */
  async shutdown() {
    this.logger.info('Shutting down WhatsApp client...');

    if (this.client) {
      await this.client.destroy();
      this.client = null;
    }

    this.isReady = false;
    this.logger.success('WhatsApp client shut down');
  }
}

export default WhatsAppClient;
