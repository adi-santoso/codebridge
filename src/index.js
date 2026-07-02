/**
 * CodeBridge - Entry Point
 *
 * WhatsApp to Claude Code bridge
 */

import { CodeBridge } from './bridge.js';
import { Logger } from './utils/logger.js';

const logger = new Logger('Main');

// Handle graceful shutdown
let bridge = null;

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down...');
  if (bridge) {
    await bridge.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down...');
  if (bridge) {
    await bridge.stop();
  }
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection:', reason);
});

// Main
async function main() {
  logger.info('🌉 CodeBridge - WhatsApp to Claude Code');
  logger.info('Version: 1.0.0');
  logger.info('');

  try {
    bridge = new CodeBridge();
    await bridge.start();

    // Show status
    const status = bridge.getStatus();
    logger.info('Status:', status);

    logger.info('');
    logger.success('✅ CodeBridge is running!');
    logger.info('Send messages via WhatsApp to interact with Claude');
    logger.info('Press Ctrl+C to stop');

  } catch (error) {
    logger.error('Failed to start:', error);
    process.exit(1);
  }
}

main();
