import { Logger } from '../utils/logger.js';

/**
 * Discord Streaming Manager
 * Handles real-time chunk-by-chunk streaming for Discord messages
 *
 * Strategy:
 * 1. Create initial message with loading indicator
 * 2. Edit message with accumulated chunks (up to 2000 chars)
 * 3. If exceeds 2000 chars, create new message for overflow
 */

const DISCORD_CHAR_LIMIT = 2000;
const MIN_UPDATE_INTERVAL = 800; // Min 800ms between edits to avoid rate limits
const LOADING_TEXT = '⏳ *Thinking...*';

export class DiscordStreamingManager {
  constructor(discordBot) {
    this.discordBot = discordBot;
    this.logger = new Logger('DiscordStreaming');

    // Active streams: channelId -> { buffer, messageId, lastUpdate, userId }
    this.activeStreams = new Map();

    // Message queue for follow-up messages (when exceeding 2000 chars)
    this.messageQueue = new Map(); // channelId -> [messageId1, messageId2, ...]
  }

  /**
   * Add chunk to active stream
   * @param {string} channelId - Discord channel ID
   * @param {string} userId - User ID
   * @param {string} chunk - Text chunk from Claude
   */
  async addChunk(channelId, userId, chunk) {
    let stream = this.activeStreams.get(channelId);

    // Create initial message if not exists
    if (!stream) {
      stream = await this.createInitialMessage(channelId, userId);
      this.activeStreams.set(channelId, stream);
    }

    // Add chunk to buffer
    stream.buffer += chunk;

    // Check rate limit - only update if enough time passed
    const now = Date.now();
    const timeSinceLastUpdate = now - stream.lastUpdate;

    if (timeSinceLastUpdate < MIN_UPDATE_INTERVAL) {
      // Too soon to update - buffer will be sent on next chunk or on finish
      return;
    }

    // Update message
    await this.updateMessage(channelId, stream);
  }

  /**
   * Finish streaming for a channel
   * @param {string} channelId - Discord channel ID
   */
  async finishStream(channelId) {
    const stream = this.activeStreams.get(channelId);

    if (!stream) {
      this.logger.warn('[finishStream] No active stream found', { channelId });
      return;
    }

    // Send final update with any remaining buffer
    if (stream.buffer.length > 0) {
      await this.updateMessage(channelId, stream);
    }

    // Cleanup
    this.activeStreams.delete(channelId);
    this.messageQueue.delete(channelId);

    this.logger.info('[finishStream] Stream finished', { channelId });
  }

  /**
   * Create initial message with loading indicator
   * @private
   */
  async createInitialMessage(channelId, userId) {
    try {
      const channel = await this.discordBot.client.channels.fetch(channelId);
      const message = await channel.send(LOADING_TEXT);

      this.logger.info('[createInitialMessage] Created streaming message', {
        channelId,
        messageId: message.id
      });

      return {
        buffer: '',
        messageId: message.id,
        lastUpdate: Date.now(),
        userId,
        currentMessageIndex: 0
      };
    } catch (error) {
      this.logger.error('[createInitialMessage] Failed to create message', {
        error: error.message,
        channelId
      });
      throw error;
    }
  }

  /**
   * Update message with current buffer
   * @private
   */
  async updateMessage(channelId, stream) {
    try {
      const channel = await this.discordBot.client.channels.fetch(channelId);

      // Check if buffer exceeds Discord limit
      if (stream.buffer.length <= DISCORD_CHAR_LIMIT) {
        // Update current message
        const message = await channel.messages.fetch(stream.messageId);
        await message.edit(stream.buffer);

        stream.lastUpdate = Date.now();

        this.logger.debug('[updateMessage] Message updated', {
          channelId,
          messageId: stream.messageId,
          bufferLength: stream.buffer.length
        });
      } else {
        // Buffer exceeds limit - need to split

        // Edit current message with first 2000 chars
        const message = await channel.messages.fetch(stream.messageId);
        const firstPart = stream.buffer.substring(0, DISCORD_CHAR_LIMIT);
        await message.edit(firstPart);

        // Send overflow as new message(s)
        const overflow = stream.buffer.substring(DISCORD_CHAR_LIMIT);
        const overflowChunks = this.splitIntoChunks(overflow);

        for (const chunk of overflowChunks) {
          const newMessage = await channel.send(chunk);

          // Update stream to track latest message
          stream.messageId = newMessage.id;
          stream.buffer = chunk; // Reset buffer to current chunk
        }

        stream.lastUpdate = Date.now();

        this.logger.info('[updateMessage] Message split due to length', {
          channelId,
          totalLength: stream.buffer.length,
          chunks: overflowChunks.length + 1
        });
      }
    } catch (error) {
      this.logger.error('[updateMessage] Failed to update message', {
        error: error.message,
        channelId,
        messageId: stream.messageId
      });

      // Don't throw - continue streaming even if one update fails
    }
  }

  /**
   * Split text into chunks of max length
   * @private
   */
  splitIntoChunks(text) {
    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= DISCORD_CHAR_LIMIT) {
        chunks.push(remaining);
        break;
      }

      // Find good split point (newline or space)
      let splitIndex = DISCORD_CHAR_LIMIT;

      // Try to split at newline
      const lastNewline = remaining.lastIndexOf('\n', DISCORD_CHAR_LIMIT);
      if (lastNewline > DISCORD_CHAR_LIMIT * 0.8) {
        splitIndex = lastNewline + 1;
      } else {
        // Try to split at space
        const lastSpace = remaining.lastIndexOf(' ', DISCORD_CHAR_LIMIT);
        if (lastSpace > DISCORD_CHAR_LIMIT * 0.8) {
          splitIndex = lastSpace + 1;
        }
      }

      chunks.push(remaining.substring(0, splitIndex));
      remaining = remaining.substring(splitIndex);
    }

    return chunks;
  }

  /**
   * Clear stream (on error or cancellation)
   * @param {string} channelId - Discord channel ID
   */
  clearStream(channelId) {
    this.activeStreams.delete(channelId);
    this.messageQueue.delete(channelId);
    this.logger.info('[clearStream] Stream cleared', { channelId });
  }

  /**
   * Check if there's an active stream for a channel
   * @param {string} channelId - Discord channel ID
   * @returns {boolean}
   */
  hasActiveStream(channelId) {
    return this.activeStreams.has(channelId);
  }

  /**
   * Get active stream count
   */
  getActiveStreamCount() {
    return this.activeStreams.size;
  }
}
