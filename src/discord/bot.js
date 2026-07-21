/**
 * Discord Bot Handler - CodeBridge
 *
 * Handles Discord messages directly in CodeBridge
 * Parallel to WhatsApp Gateway input
 */

import { Client, GatewayIntentBits, Events } from 'discord.js';
import { EventEmitter } from 'events';

export class DiscordBot extends EventEmitter {
  constructor(options = {}) {
    super();

    this.token = options.token || process.env.DISCORD_BOT_TOKEN;
    this.allowedGuilds = options.allowedGuilds || this.parseEnvList(process.env.DISCORD_ALLOWED_GUILDS);
    this.allowedChannels = options.allowedChannels || this.parseEnvList(process.env.DISCORD_ALLOWED_CHANNELS);
    this.allowedUsers = options.allowedUsers || this.parseEnvList(process.env.DISCORD_ALLOWED_USERS);

    this.client = null;
    this.isReady = false;

    console.log('[Discord] Bot initialized with config:', {
      hasToken: !!this.token,
      allowedGuilds: this.allowedGuilds,
      allowedChannels: this.allowedChannels,
      allowedUsers: this.allowedUsers
    });
  }

  /**
   * Parse comma-separated environment variable
   */
  parseEnvList(envValue) {
    if (!envValue || envValue.trim() === '') return [];
    return envValue.split(',').map(v => v.trim()).filter(Boolean);
  }

  /**
   * Initialize Discord bot
   */
  async initialize() {
    if (!this.token) {
      console.warn('[Discord] No bot token configured - Discord bot disabled');
      return false;
    }

    try {
      // Create Discord client with required intents
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages
        ]
      });

      // Setup event handlers
      this.setupEventHandlers();

      // Login to Discord
      await this.client.login(this.token);

      console.log('[Discord] Bot initialization started...');
      return true;

    } catch (error) {
      console.error('[Discord] Failed to initialize bot:', error.message);
      return false;
    }
  }

  /**
   * Setup Discord event handlers
   */
  setupEventHandlers() {
    // Bot ready event
    this.client.once(Events.ClientReady, (readyClient) => {
      this.isReady = true;
      console.log('[Discord] ============================================');
      console.log('[Discord] Bot is ready!');
      console.log('[Discord] Logged in as:', readyClient.user.tag);
      console.log('[Discord] Bot ID:', readyClient.user.id);
      console.log('[Discord] Serving', readyClient.guilds.cache.size, 'guilds');
      console.log('[Discord] ============================================');

      this.emit('ready', readyClient.user);
    });

    // Message create event
    this.client.on(Events.MessageCreate, async (message) => {
      try {
        // Ignore bot messages (prevent loops)
        if (message.author.bot) {
          return;
        }

        // Check user whitelist (if configured)
        if (this.allowedUsers.length > 0) {
          if (!this.allowedUsers.includes(message.author.id)) {
            console.log(`[Discord] Message from non-whitelisted user: ${message.author.id}`);
            return;
          }
        }

        // Check guild whitelist (if configured)
        if (this.allowedGuilds.length > 0 && message.guild) {
          if (!this.allowedGuilds.includes(message.guild.id)) {
            console.log(`[Discord] Message from non-whitelisted guild: ${message.guild.id}`);
            return;
          }
        }

        // Check channel whitelist (if configured)
        if (this.allowedChannels.length > 0) {
          if (!this.allowedChannels.includes(message.channel.id)) {
            console.log(`[Discord] Message from non-whitelisted channel: ${message.channel.id}`);
            return;
          }
        }

        // Log message received
        console.log('[Discord] Message received:', {
          author: message.author.tag,
          authorId: message.author.id,
          channel: message.channel.name || 'DM',
          channelId: message.channel.id,
          guild: message.guild?.name || 'DM',
          guildId: message.guild?.id || null,
          content: message.content.substring(0, 50) + '...'
        });

        // Emit message event for MessageHandler
        this.emit('message', {
          userId: `discord:${message.author.id}`,
          message: message.content,
          platform: 'discord',
          channelId: message.channel.id,
          guildId: message.guild?.id || null,
          metadata: {
            author: {
              id: message.author.id,
              username: message.author.username,
              discriminator: message.author.discriminator,
              tag: message.author.tag
            },
            channel: {
              id: message.channel.id,
              name: message.channel.name || 'DM',
              type: message.channel.type
            },
            guild: message.guild ? {
              id: message.guild.id,
              name: message.guild.name
            } : null,
            messageId: message.id
          }
        });

      } catch (error) {
        console.error('[Discord] Error handling message:', error);
      }
    });

    // Error handling
    this.client.on(Events.Error, (error) => {
      console.error('[Discord] Client error:', error);
      this.emit('error', error);
    });

    // Warn event
    this.client.on(Events.Warn, (info) => {
      console.warn('[Discord] Client warning:', info);
    });
  }

  /**
   * Send message to Discord channel
   * @param {string} channelId - Discord channel ID
   * @param {string} message - Message text
   */
  async sendMessage(channelId, message) {
    if (!this.isReady) {
      throw new Error('Discord bot is not ready');
    }

    try {
      const channel = await this.client.channels.fetch(channelId);

      if (!channel) {
        throw new Error(`Channel ${channelId} not found`);
      }

      if (!channel.isTextBased()) {
        throw new Error(`Channel ${channelId} is not a text channel`);
      }

      // Split message if too long (Discord limit: 2000 chars)
      const MAX_LENGTH = 2000;
      if (message.length <= MAX_LENGTH) {
        await channel.send(message);
      } else {
        // Split into chunks
        const chunks = this.splitMessage(message, MAX_LENGTH);
        for (const chunk of chunks) {
          await channel.send(chunk);
        }
      }

      console.log('[Discord] Message sent to channel:', channelId);

    } catch (error) {
      console.error('[Discord] Failed to send message:', error.message);
      throw error;
    }
  }

  /**
   * Split message into chunks
   */
  splitMessage(text, maxLength) {
    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Try to split at newline
      let splitIndex = remaining.lastIndexOf('\n', maxLength);
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        // No good newline, try space
        splitIndex = remaining.lastIndexOf(' ', maxLength);
      }
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        // No good space, hard split
        splitIndex = maxLength;
      }

      chunks.push(remaining.substring(0, splitIndex));
      remaining = remaining.substring(splitIndex).trim();
    }

    return chunks;
  }

  /**
   * Shutdown Discord bot
   */
  async shutdown() {
    if (this.client) {
      console.log('[Discord] Shutting down bot...');
      await this.client.destroy();
      this.isReady = false;
      console.log('[Discord] Bot shutdown complete');
    }
  }

  /**
   * Check if bot is ready
   */
  ready() {
    return this.isReady;
  }
}

export default DiscordBot;
