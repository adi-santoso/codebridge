# CodeBridge - Setup Guide

## Prerequisites

- Ubuntu Server 22.04 LTS (atau Windows dengan WSL2)
- Node.js 18+ dan npm
- Git
- Baileys WhatsApp Gateway sudah running

## 1. Initial Setup

### 1.1 Clone atau Setup Repository

```bash
cd /home/user
git clone <your-repo-url> codebridge
# atau jika sudah ada folder:
cd codebridge
```

### 1.2 Install Dependencies

```bash
npm install
```

### 1.3 Create Directories

```bash
mkdir -p data/sessions
mkdir -p data/logs
chmod 755 data
```

## 2. Configuration

### 2.1 Environment Variables

```bash
cp config/.env.example .env
nano .env
```

Edit sesuai environment kamu:

```bash
# Baileys Gateway URL
BAILEYS_URL=http://localhost:3000
BAILEYS_SESSION_ID=default

# Whitelist nomor WA (tanpa +, pisah dengan koma)
ALLOWED_NUMBERS=628123456789,628987654321

# Claude API Key (dapatkan dari https://console.anthropic.com/)
CLAUDE_API_KEY=sk-ant-api03-xxxxx

# Session timeout (30 menit dalam milliseconds)
SESSION_IDLE_TIMEOUT=1800000

# Max concurrent sessions
MAX_CONCURRENT_SESSIONS=10

# Log level
LOG_LEVEL=info
LOG_FILE=./data/logs/codebridge.log
```

### 2.2 Projects Configuration

Edit `config/projects.json`:

```bash
nano config/projects.json
```

Sesuaikan dengan path project kamu:

```json
{
  "laravel-api": {
    "path": "/home/user/projects/laravel-api",
    "description": "Laravel REST API Project",
    "default": true,
    "settings": {
      "autoCommit": false,
      "autoTest": true
    }
  },
  "react-app": {
    "path": "/home/user/projects/react-app",
    "description": "React Dashboard",
    "default": false,
    "settings": {
      "autoCommit": false,
      "autoTest": false
    }
  }
}
```

**Important**: Pastikan path project ada dan accessible!

```bash
# Verify project paths
ls -la /home/user/projects/laravel-api
ls -la /home/user/projects/react-app
```

### 2.3 Settings (Optional)

Edit `config/settings.json` jika perlu custom settings:

```bash
nano config/settings.json
```

## 3. Baileys Gateway Setup

### 3.1 Verify Baileys Running

```bash
# Check if Baileys gateway is running
curl http://localhost:3000/status?session=default
```

Expected response:
```json
{
  "status": "connected",
  "session": "default"
}
```

### 3.2 QR Code Login (jika belum login)

1. Akses UI Baileys gateway di browser: `http://your-server:3000`
2. Create new session atau pilih existing
3. Scan QR code dengan WhatsApp
4. Tunggu sampai status "connected"

## 4. Run CodeBridge

### 4.1 Development Mode

```bash
npm run dev
```

Ini akan run dengan auto-reload saat ada perubahan file.

### 4.2 Production Mode (Manual)

```bash
npm start
```

### 4.3 Production Mode (dengan PM2)

Install PM2 globally (jika belum):

```bash
npm install -g pm2
```

Start CodeBridge:

```bash
npm run start:prod
```

Check status:

```bash
pm2 status
pm2 logs codebridge
```

Auto-start on server reboot:

```bash
pm2 save
pm2 startup
# Ikuti instruksi yang muncul
```

### 4.4 Production Mode (dengan Systemd)

Create systemd service file:

```bash
sudo nano /etc/systemd/system/codebridge.service
```

Content:

```ini
[Unit]
Description=CodeBridge WhatsApp to Claude Code Bridge
After=network.target

[Service]
Type=simple
User=yourusername
WorkingDirectory=/home/user/codebridge
ExecStart=/usr/bin/node src/mcp-server/server.js
Restart=always
RestartSec=10
StandardOutput=append:/home/user/codebridge/data/logs/stdout.log
StandardError=append:/home/user/codebridge/data/logs/stderr.log

# Environment
Environment=NODE_ENV=production
Environment=PATH=/usr/bin:/usr/local/bin

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable codebridge
sudo systemctl start codebridge
sudo systemctl status codebridge
```

View logs:

```bash
sudo journalctl -u codebridge -f
```

## 5. Testing

### 5.1 Test WhatsApp Connection

Kirim message dari nomor yang ada di whitelist:

```
hi
```

Expected response dari bot.

### 5.2 Test Commands

```
/help
```

Expected: List of available commands

```
/projects
```

Expected: List of configured projects

```
/status
```

Expected: Session status info

### 5.3 Test Project Switching

```
/switch laravel-api
```

Expected: Confirmation message

### 5.4 Test Coding

```
list all files in current directory
```

Expected: Claude response dengan file list

## 6. Monitoring

### 6.1 View Logs

```bash
# Application logs
tail -f data/logs/codebridge.log

# PM2 logs
pm2 logs codebridge

# Systemd logs
sudo journalctl -u codebridge -f
```

### 6.2 Check Sessions

```bash
# List active session files
ls -la data/sessions/

# View specific session
cat data/sessions/628123456789.json | jq
```

### 6.3 Check Process

```bash
# PM2
pm2 status
pm2 monit

# Systemd
sudo systemctl status codebridge

# Manual
ps aux | grep node
```

## 7. Troubleshooting

### 7.1 Bot Tidak Respond

**Check 1: Baileys Gateway**

```bash
curl http://localhost:3000/status?session=default
```

Jika failed → restart Baileys gateway

**Check 2: Whitelist**

Verify nomor kamu ada di `.env`:

```bash
grep ALLOWED_NUMBERS .env
```

**Check 3: Logs**

```bash
tail -50 data/logs/codebridge.log
```

Look for errors atau warnings.

### 7.2 Claude Instance Error

**Check 1: Claude API Key**

```bash
# Test API key
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $CLAUDE_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "hi"}]
  }'
```

**Check 2: Project Path**

```bash
# Verify project exists
ls -la /home/user/projects/laravel-api
```

**Check 3: Permissions**

```bash
# Check if node can access project
sudo -u yourusername ls /home/user/projects/laravel-api
```

### 7.3 Memory Issues

**Check memory usage:**

```bash
free -h
pm2 monit
```

**Solution: Reduce concurrent sessions**

Edit `.env`:

```bash
MAX_CONCURRENT_SESSIONS=5
SESSION_IDLE_TIMEOUT=900000  # 15 minutes
```

Restart:

```bash
pm2 restart codebridge
```

### 7.4 "Project not found"

**Check projects.json:**

```bash
cat config/projects.json | jq
```

Pastikan:
1. JSON valid (no syntax errors)
2. Path benar dan exists
3. At least one project with `"default": true`

### 7.5 Rate Limit Hit

User dapat message "Too many requests".

**Check rate limit settings:**

```bash
grep RATE_LIMIT .env
```

**Adjust if needed:**

```bash
RATE_LIMIT_WINDOW=60000        # 1 minute
RATE_LIMIT_MAX_REQUESTS=20     # Increase to 20
```

## 8. Maintenance

### 8.1 Update CodeBridge

```bash
cd /home/user/codebridge
git pull
npm install
pm2 restart codebridge
```

### 8.2 Clear Old Sessions

```bash
# Manual cleanup
rm data/sessions/*.json

# Or keep only recent (last 7 days)
find data/sessions/ -name "*.json" -mtime +7 -delete
```

### 8.3 Rotate Logs

```bash
# Manual
mv data/logs/codebridge.log data/logs/codebridge.log.old
pm2 restart codebridge

# Or use logrotate (recommended)
sudo nano /etc/logrotate.d/codebridge
```

Logrotate config:

```
/home/user/codebridge/data/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

### 8.4 Backup

```bash
# Backup script
#!/bin/bash
DATE=$(date +%Y%m%d)
tar -czf backup-codebridge-$DATE.tar.gz \
  data/sessions/ \
  config/ \
  .env

# Upload to backup storage
# rsync or scp to backup server
```

### 8.5 Monitor Disk Usage

```bash
# Check disk
df -h

# Check CodeBridge data folder
du -sh data/
du -sh data/logs/
du -sh data/sessions/
```

## 9. Security Hardening

### 9.1 File Permissions

```bash
chmod 600 .env
chmod 700 data/sessions
chmod 644 config/*.json
```

### 9.2 Firewall

```bash
# Allow only local Baileys gateway
sudo ufw allow from 127.0.0.1 to any port 3001

# Or specific IP
sudo ufw allow from 192.168.1.100 to any port 3001
```

### 9.3 Regular Updates

```bash
# Update system packages
sudo apt update && sudo apt upgrade

# Update Node.js packages
npm outdated
npm update
```

## 10. Uninstall

### 10.1 Stop Services

```bash
# PM2
pm2 stop codebridge
pm2 delete codebridge
pm2 save

# Systemd
sudo systemctl stop codebridge
sudo systemctl disable codebridge
sudo rm /etc/systemd/system/codebridge.service
```

### 10.2 Remove Files

```bash
cd /home/user
rm -rf codebridge
```

### 10.3 Optional: Remove Baileys

```bash
rm -rf baileys-gateway
```

---

## Quick Reference

### Start/Stop Commands

```bash
# Development
npm run dev

# Production (PM2)
npm run start:prod
pm2 stop codebridge
pm2 restart codebridge
pm2 logs codebridge

# Production (Systemd)
sudo systemctl start codebridge
sudo systemctl stop codebridge
sudo systemctl restart codebridge
sudo systemctl status codebridge
```

### Useful Commands

```bash
# View logs
tail -f data/logs/codebridge.log

# Check sessions
ls -la data/sessions/

# Test Baileys
curl http://localhost:3000/status?session=default

# Check process
ps aux | grep codebridge
```

---

**Need help?** Check `docs/ARCHITECTURE.md` or create an issue on GitHub.
