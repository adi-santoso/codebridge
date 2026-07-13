/**
 * Socket.IO Configuration
 */

export const socketConfig = {
  // Server port
  port: process.env.SOCKET_PORT || 3848,

  // Authentication
  authKey: process.env.SOCKET_AUTH_KEY || 'codebridge-secret-key-change-in-production',

  // CORS configuration
  cors: {
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  },

  // Connection settings
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6, // 1MB

  // Rate limiting
  rateLimit: {
    maxRequests: 10, // Max requests per window
    windowMs: 60000 // 1 minute window
  },

  // Session settings
  maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '50'),
  maxHistoryLength: parseInt(process.env.MAX_HISTORY_LENGTH || '20'),
  requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000'), // 30 seconds

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info'
};

export default socketConfig;
