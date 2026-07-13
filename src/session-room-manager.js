/**
 * Session Room Manager
 *
 * Responsibilities:
 * - Track active session rooms
 * - Auto join room saat session created
 * - Auto leave room saat session closed
 * - Re-join all rooms after reconnect
 * - Sync dengan SessionManager
 *
 * Integration:
 * - SessionManager triggers: onSessionCreated, onSessionClosed
 * - GatewayClient: joinRoom, leaveRoom, onReconnect
 */

import { Logger } from './utils/logger.js';

class SessionRoomManager {
  constructor(gatewayClient, sessionManager) {
    this.gatewayClient = gatewayClient;
    this.sessionManager = sessionManager;
    this.sessionRooms = new Map(); // sessionId -> { phoneNumber, joinedAt }
    this.logger = new Logger('SessionRoomManager');

    this.logger.info('Initialized');
  }

  /**
   * Initialize - setup listeners
   */
  initialize() {
    // Listen untuk session lifecycle dari SessionManager
    this._setupSessionListeners();

    // Sync existing sessions (jika ada)
    this._syncExistingSessions();

    this.logger.info('[SessionRoomManager] Ready');
  }

  /**
   * Setup listeners untuk SessionManager events
   */
  _setupSessionListeners() {
    // Hook into SessionManager (perlu ada event emitter di SessionManager)
    // Untuk saat ini, kita akan expose methods yang dipanggil manual
    this.logger.debug('[SessionRoomManager] Session listeners setup (manual mode)');
  }

  /**
   * Sync existing sessions ke Gateway rooms
   */
  async _syncExistingSessions() {
    try {
      const existingSessions = await this.sessionManager.getAllSessions();

      if (!existingSessions || existingSessions.length === 0) {
        this.logger.info('[SessionRoomManager] No existing sessions to sync');
        return;
      }

      this.logger.info('[SessionRoomManager] Syncing existing sessions', {
        count: existingSessions.length
      });

      for (const session of existingSessions) {
        // Only join rooms for active sessions
        if (session.status === 'active') {
          this.onSessionCreated(session.sessionId, session.phoneNumber);
        }
      }

      this.logger.info('[SessionRoomManager] Session sync completed', {
        activeRooms: this.sessionRooms.size
      });
    } catch (error) {
      this.logger.error('[SessionRoomManager] Failed to sync existing sessions', {
        error: error.message
      });
    }
  }

  /**
   * Handle session created - join Gateway room
   * @param {string} sessionId - Session ID
   * @param {string} phoneNumber - Phone number
   */
  onSessionCreated(sessionId, phoneNumber) {
    if (!sessionId) {
      this.logger.warn('[SessionRoomManager] Invalid sessionId for room join');
      return;
    }

    // Join Gateway room
    const joined = this.gatewayClient.joinRoom(sessionId);

    if (joined) {
      this.sessionRooms.set(sessionId, {
        phoneNumber,
        joinedAt: Date.now()
      });

      this.logger.info('[SessionRoomManager] Session room joined', {
        sessionId,
        phoneNumber,
        totalRooms: this.sessionRooms.size
      });
    } else {
      this.logger.error('[SessionRoomManager] Failed to join room', {
        sessionId,
        phoneNumber
      });
    }
  }

  /**
   * Handle session closed - leave Gateway room
   * @param {string} sessionId - Session ID
   */
  onSessionClosed(sessionId) {
    if (!sessionId) {
      this.logger.warn('[SessionRoomManager] Invalid sessionId for room leave');
      return;
    }

    const roomInfo = this.sessionRooms.get(sessionId);

    // Leave Gateway room
    const left = this.gatewayClient.leaveRoom(sessionId);

    if (left) {
      this.sessionRooms.delete(sessionId);

      this.logger.info('[SessionRoomManager] Session room left', {
        sessionId,
        phoneNumber: roomInfo?.phoneNumber,
        duration: roomInfo ? Date.now() - roomInfo.joinedAt : 0,
        totalRooms: this.sessionRooms.size
      });
    } else {
      this.logger.error('[SessionRoomManager] Failed to leave room', {
        sessionId
      });
    }
  }

  /**
   * Handle Gateway reconnect - rejoin all rooms
   */
  onGatewayReconnected() {
    this.logger.info('[SessionRoomManager] Gateway reconnected - rejoining rooms', {
      count: this.sessionRooms.size
    });

    // GatewayClient already handles rejoin via activeRooms Set
    // But we can also explicitly rejoin from our tracking
    for (const [sessionId, info] of this.sessionRooms.entries()) {
      this.gatewayClient.joinRoom(sessionId);
      this.logger.debug('[SessionRoomManager] Rejoined room', {
        sessionId,
        phoneNumber: info.phoneNumber
      });
    }
  }

  /**
   * Get all active session rooms
   */
  getActiveRooms() {
    return Array.from(this.sessionRooms.entries()).map(([sessionId, info]) => ({
      sessionId,
      phoneNumber: info.phoneNumber,
      joinedAt: info.joinedAt,
      duration: Date.now() - info.joinedAt
    }));
  }

  /**
   * Check if session room is active
   * @param {string} sessionId - Session ID
   */
  isRoomActive(sessionId) {
    return this.sessionRooms.has(sessionId);
  }

  /**
   * Get session room info
   * @param {string} sessionId - Session ID
   */
  getRoomInfo(sessionId) {
    return this.sessionRooms.get(sessionId);
  }

  /**
   * Force rejoin room (untuk recovery)
   * @param {string} sessionId - Session ID
   */
  async rejoinRoom(sessionId) {
    try {
      // Get session info from SessionManager
      const session = await this.sessionManager.getSession(sessionId);

      if (!session) {
        this.logger.error('[SessionRoomManager] Cannot rejoin - session not found', {
          sessionId
        });
        return false;
      }

      // Rejoin room
      this.onSessionCreated(sessionId, session.phoneNumber);
      return true;

    } catch (error) {
      this.logger.error('[SessionRoomManager] Failed to rejoin room', {
        sessionId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Cleanup - leave all rooms
   */
  async cleanup() {
    this.logger.info('[SessionRoomManager] Cleaning up - leaving all rooms', {
      count: this.sessionRooms.size
    });

    for (const sessionId of this.sessionRooms.keys()) {
      this.gatewayClient.leaveRoom(sessionId);
    }

    this.sessionRooms.clear();
    this.logger.info('[SessionRoomManager] Cleanup completed');
  }
}

export default SessionRoomManager;
