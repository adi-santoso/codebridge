/**
 * PM2 Ecosystem Configuration for CodeBridge
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 stop codebridge
 *   pm2 restart codebridge
 *   pm2 logs codebridge
 *   pm2 monit
 */

module.exports = {
  apps: [
    {
      name: 'codebridge',
      script: './src/main.js',

      // Working directory
      cwd: '/var/www/codebridge',

      // Interpreter
      interpreter: 'node',

      // Environment variables (loaded from .env automatically via dotenv)
      env: {
        NODE_ENV: 'production',
        PATH: '/home/deploy/.local/bin:/usr/local/bin:/usr/bin:/bin:' + process.env.PATH
      },

      // Instance configuration
      instances: 1, // Single instance (Claude spawner tidak support clustering)
      exec_mode: 'fork', // Fork mode (bukan cluster)

      // Auto restart configuration
      autorestart: true,
      watch: false, // Disable watch mode (restart manual saja)
      max_memory_restart: '1G', // Restart jika memory > 1GB

      // Restart behavior
      min_uptime: '10s', // Minimum uptime sebelum dianggap "started"
      max_restarts: 10, // Max restart attempts dalam 1 menit
      restart_delay: 4000, // Delay 4 detik sebelum restart

      // Logging
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Advanced options
      kill_timeout: 5000, // Timeout untuk graceful shutdown (5 detik)
      listen_timeout: 10000, // Timeout untuk startup (10 detik)
      shutdown_with_message: false,

      // Cron restart (optional - restart setiap hari jam 3 pagi)
      // cron_restart: '0 3 * * *',

      // Environment-specific overrides
      env_development: {
        NODE_ENV: 'development',
        DEBUG: 'true',
        LOG_LEVEL: 'debug'
      },

      env_production: {
        NODE_ENV: 'production',
        DEBUG: 'false',
        LOG_LEVEL: 'info'
      }
    }
  ]
};
