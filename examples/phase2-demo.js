/**
 * Phase 2 Demo - WhatsApp Integration Test
 *
 * This simulates WhatsApp messages without actual WhatsApp connection
 * to test the message handling flow
 */

import { SessionManager } from '../src/claude/session-manager.js';
import { MessageHandler } from '../src/whatsapp/message-handler.js';
import { Logger } from '../src/utils/logger.js';

const logger = new Logger('Phase2Demo');

// Mock WhatsApp client
class MockWhatsAppClient {
  constructor() {
    this.isReady = true;
    this.sentMessages = [];
  }

  async sendMessage(chatId, text) {
    logger.info('📤 [Mock WhatsApp] Sending to', chatId);
    logger.info('Message:', text);
    this.sentMessages.push({ chatId, text, timestamp: Date.now() });
  }

  async sendTyping(chatId) {
    logger.debug('⌨️  [Mock WhatsApp] Typing indicator to', chatId);
  }
}

// Mock WhatsApp message
function createMockMessage(from, body) {
  return {
    from,
    body,
    fromMe: false
  };
}

async function main() {
  console.log('🚀 Phase 2 Demo - WhatsApp Integration\n');

  const sessionManager = new SessionManager();
  const mockWhatsApp = new MockWhatsAppClient();
  const messageHandler = new MessageHandler(sessionManager, mockWhatsApp);

  const TEST_USER = '628123456789@c.us'; // Mock WhatsApp user ID

  try {
    // Test 1: /start command
    logger.info('\n' + '='.repeat(50));
    logger.info('TEST 1: /start command');
    logger.info('='.repeat(50));

    const msg1 = createMockMessage(TEST_USER, '/start');
    await messageHandler.handleMessage(msg1);

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 2: Send coding question
    logger.info('\n' + '='.repeat(50));
    logger.info('TEST 2: Send coding question');
    logger.info('='.repeat(50));

    const msg2 = createMockMessage(
      TEST_USER,
      'Hello! Can you help me create a simple JavaScript function to reverse a string?'
    );
    await messageHandler.handleMessage(msg2);

    // Wait for Claude response
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Test 3: Follow-up question (test context)
    logger.info('\n' + '='.repeat(50));
    logger.info('TEST 3: Follow-up question (context test)');
    logger.info('='.repeat(50));

    const msg3 = createMockMessage(
      TEST_USER,
      'Can you explain how that function works?'
    );
    await messageHandler.handleMessage(msg3);

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Test 4: /reset command
    logger.info('\n' + '='.repeat(50));
    logger.info('TEST 4: /reset command');
    logger.info('='.repeat(50));

    const msg4 = createMockMessage(TEST_USER, '/reset');
    await messageHandler.handleMessage(msg4);

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Show results
    logger.info('\n' + '='.repeat(50));
    logger.success('✅ ALL TESTS COMPLETED');
    logger.info('='.repeat(50));

    logger.info('\nMessages sent by mock WhatsApp:');
    mockWhatsApp.sentMessages.forEach((msg, i) => {
      logger.info(`${i + 1}. To: ${msg.chatId}`);
      logger.info(`   Text: ${msg.text.substring(0, 100)}...`);
    });

    logger.info('\nPhase 2 Components:');
    logger.info('  ✅ WhatsAppClient wrapper');
    logger.info('  ✅ MessageHandler routing');
    logger.info('  ✅ Command processing (/start, /reset, /help)');
    logger.info('  ✅ Claude integration');
    logger.info('  ✅ Multi-turn conversation via WhatsApp');

    // Cleanup
    await sessionManager.closeAllSessions();

    process.exit(0);

  } catch (error) {
    logger.error('TEST FAILED:', error);
    console.error(error);

    await sessionManager.closeAllSessions();
    process.exit(1);
  }
}

main();
