# CodeBridge Command System - Phase 9: Admin Commands

**Multi-User Management and System Administration**

This document covers all admin commands for managing users, permissions, and system configuration.

---

## Table of Contents

1. [Overview](#overview)
2. [Role Hierarchy](#role-hierarchy)
3. [Admin Commands](#admin-commands)
4. [Whitelist Management](#whitelist-management)
5. [Security Best Practices](#security-best-practices)
6. [Audit Logs](#audit-logs)
7. [Migration Guide](#migration-guide)

---

## Overview

Phase 9 introduces comprehensive multi-user management with role-based access control (RBAC), whitelist management, and system administration capabilities.

### Features

- **Role-Based Access Control**: Three-tier hierarchy (user, admin, superadmin)
- **Whitelist Management**: Database-backed phone number whitelist
- **Session Management**: View and control active user sessions
- **System Statistics**: Real-time system-wide metrics
- **Audit Logging**: Complete audit trail for all admin actions
- **Configuration Reload**: Hot-reload environment variables

### Requirements

- Admin role or higher to use admin commands
- Superadmin role for user role management
- All admin actions are logged

---

## Role Hierarchy

CodeBridge uses a three-tier role hierarchy:

```
user (0) < admin (1) < superadmin (2)
```

### User Role (Default)

- All standard CodeBridge commands
- Cannot access admin commands
- Cannot manage other users
- No system administration access

### Admin Role

- All user role permissions
- Can list active users and sessions
- Can force-close user sessions
- Can view system statistics
- Can manage whitelist (add/remove numbers)
- Can reload configuration
- **Cannot** grant or revoke roles

### Superadmin Role (Highest)

- All admin role permissions
- Can grant admin/superadmin roles to users
- Can revoke roles from users
- Full system administration access
- Cannot modify own role (safety)

### Role Icons

- 👤 User
- ⚙️ Admin
- 👑 Superadmin

---

## Admin Commands

All admin commands are accessed via `/admin <subcommand> [args]`.

### View Active Users

**Command:** `/admin users`

**Permission:** Admin or Superadmin

**Description:** Lists all active users and their sessions.

**Example:**
```
/admin users
```

**Response:**
```
📊 *Active Users* (3)

👑 6285727042754
  Session: sess_abc1...
  Project: codebridge
  Age: 2h 15m
  State: PROJECT_SELECTED

⚙️ 6281234567890
  Session: sess_xyz9...
  Project: myapp
  Age: 45m
  State: SESSION_SELECTED

👤 6289876543210
  Session: sess_def4...
  Project: None
  Age: 12m
  State: SESSION_SELECTED
```

---

### Force Close Session

**Command:** `/admin kill <userId>`

**Permission:** Admin or Superadmin

**Description:** Force-close a user's active session. Cannot kill sessions of users with equal or higher role.

**Example:**
```
/admin kill 6281234567890
```

**Response:**
```
✅ *Session Killed*

User: 6281234567890
Session: sess_xyz9...

User has been disconnected.
```

**Restrictions:**
- Cannot kill own session (use `/closesession` instead)
- Cannot kill sessions of users with equal or higher role
- User must have active session

---

### System Statistics

**Command:** `/admin stats`

**Permission:** Admin or Superadmin

**Description:** View system-wide statistics across all users.

**Example:**
```
/admin stats
```

**Response:**
```
📊 *System Statistics*

👥 *Users*
  Total: 25
  Active Sessions: 3
  Admins: 2
  Superadmins: 1

💬 *Commands*
  Total Executed: 1,542
  Last 24h: 287
  Success Rate: 94%

🛠️ *Tools*
  Total Executed: 856
  Last 24h: 142
  Success Rate: 89%

🚨 *Errors*
  Total: 95
  Last 24h: 12

📝 *Database*
  Saved Sessions: 18
  Audit Logs: 423
```

---

### Reload Configuration

**Command:** `/admin reload`

**Permission:** Admin or Superadmin

**Description:** Reload environment variables from `.env` file without restarting.

**Example:**
```
/admin reload
```

**Response:**
```
✅ *Configuration Reloaded*

Environment variables have been reloaded from .env file.

⚠️ *Note:* Some changes may require application restart to take full effect.
```

---

## Whitelist Management

Manage which phone numbers can access CodeBridge.

### Add to Whitelist

**Command:** `/admin whitelist add <phoneNumber> [notes]`

**Permission:** Admin or Superadmin

**Description:** Add a phone number to the whitelist with optional notes.

**Example:**
```
/admin whitelist add 6281234567890 John Doe - Developer
```

**Response:**
```
✅ *Added to Whitelist*

Phone: 6281234567890
Notes: John Doe - Developer

User can now access CodeBridge.
```

**Phone Number Format:**
- 8-15 digits
- Include country code
- No + or spaces
- Example: `6281234567890`

---

### Remove from Whitelist

**Command:** `/admin whitelist remove <phoneNumber>`

**Permission:** Admin or Superadmin

**Description:** Remove a phone number from the whitelist.

**Example:**
```
/admin whitelist remove 6281234567890
```

**Response:**
```
✅ *Removed from Whitelist*

Phone: 6281234567890

User can no longer access CodeBridge.
```

**Restrictions:**
- Cannot remove own phone number
- Only removes from database (check `.env` for legacy whitelist)

---

### List Whitelist

**Command:** `/admin whitelist list`

**Permission:** Admin or Superadmin

**Description:** Show all whitelisted phone numbers with details.

**Example:**
```
/admin whitelist list
```

**Response:**
```
📋 *Whitelist* (5)

📱 *6285727042754*
  Notes: Initial superadmin
  Added: Dec 15, 10:30 AM
  By: system

📱 *6281234567890*
  Notes: John Doe - Developer
  Added: Dec 20, 02:15 PM
  By: 6285727042754

📱 *6289876543210*
  Added: Dec 21, 09:00 AM
  By: 6285727042754
```

---

## Role Management (Superadmin Only)

### Grant Role

**Command:** `/admin grant <userId> <role>`

**Permission:** Superadmin only

**Description:** Grant admin or superadmin role to a user.

**Roles:** `admin`, `superadmin`

**Example:**
```
/admin grant 6281234567890 admin
```

**Response:**
```
✅ *Role Granted*

User: 6281234567890
New Role: admin
Previous: user

User now has admin privileges.
```

**Restrictions:**
- Cannot modify own role
- User must be whitelisted
- Only superadmin can grant roles

---

### Revoke Role

**Command:** `/admin revoke <userId>`

**Permission:** Superadmin only

**Description:** Revoke admin/superadmin role from a user (back to user role).

**Example:**
```
/admin revoke 6281234567890
```

**Response:**
```
✅ *Role Revoked*

User: 6281234567890
Previous Role: admin
New Role: user

User now has standard user privileges.
```

**Restrictions:**
- Cannot revoke own role
- Sets user back to `user` role (lowest)

---

## Security Best Practices

### 1. Initial Setup

1. Set `SUPERADMIN_INITIAL` in `.env` to your phone number
2. Run whitelist migration to move from `.env` to database
3. Grant admin roles to trusted users only
4. Enable audit logging (`ADMIN_AUDIT_ENABLED=true`)

### 2. Role Assignment

- **Principle of Least Privilege**: Grant minimum necessary role
- **Superadmin**: Only for system owners (1-2 people)
- **Admin**: For trusted team members who need user management
- **User**: For everyone else

### 3. Whitelist Management

- Regularly review `/admin whitelist list`
- Remove users who no longer need access
- Use descriptive notes when adding users
- Monitor audit logs for whitelist changes

### 4. Session Management

- Monitor active sessions with `/admin users`
- Kill suspicious sessions immediately
- Check for inactive sessions regularly

### 5. Audit Logs

- Review audit logs periodically
- Look for suspicious patterns:
  - Multiple failed admin actions
  - Unusual whitelist changes
  - Role changes
  - Session kills

### 6. Configuration

```env
# Security Configuration
ADMIN_ENABLED=true
ADMIN_AUDIT_ENABLED=true
ADMIN_AUDIT_RETENTION_DAYS=365
WHITELIST_MODE=database  # Use database whitelist
```

---

## Audit Logs

All admin actions are logged to the `audit_log` table.

### Logged Actions

- `LIST_USERS` - Viewing active users
- `KILL_SESSION` - Force-closing sessions
- `VIEW_STATS` - Viewing system statistics
- `RELOAD_CONFIG` - Reloading configuration
- `WHITELIST_ADD` - Adding to whitelist
- `WHITELIST_REMOVE` - Removing from whitelist
- `WHITELIST_LIST` - Viewing whitelist
- `GRANT_ROLE` - Granting roles
- `REVOKE_ROLE` - Revoking roles

### Audit Log Structure

```javascript
{
  id: 1,
  userId: '6285727042754',
  action: 'GRANT_ROLE',
  target: '6281234567890',
  details: 'Granted admin role (was user)',
  timestamp: 1703001234567
}
```

### Viewing Audit Logs

Audit logs are stored in the database. Future versions will include commands to view them.

For now, query directly:
```sql
SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 50;
```

---

## Migration Guide

### Migrating from .env Whitelist to Database

CodeBridge now supports database-backed whitelisting for better management.

#### Step 1: Check Current Whitelist

In `.env`:
```env
ALLOWED_USERS=6285727042754,6281234567890,6289876543210
```

#### Step 2: Run Migration Script

```bash
node src/database/migrations/migrate-whitelist.js
```

**Output:**
```
=== Whitelist Migration Result ===

Migrated: 3
Skipped: 0
Failed: 0

Migrated 3 numbers, skipped 0, failed 0
```

#### Step 3: Update Configuration

In `.env`:
```env
# Use database whitelist
WHITELIST_MODE=database

# Keep .env as backup (optional)
# WHITELIST_MODE=both

# Legacy whitelist (optional, for reference)
ALLOWED_USERS=6285727042754,6281234567890,6289876543210
```

#### Step 4: Verify Migration

```
/admin whitelist list
```

Should show all migrated numbers.

### Whitelist Modes

- `database` (Recommended) - Use database whitelist only
- `env` - Use .env whitelist only (legacy)
- `both` - Check both database and .env (transition period)

---

## Quick Reference

### Common Admin Tasks

**Setup new admin:**
```
/admin whitelist add 6281234567890 New Admin
/admin grant 6281234567890 admin
```

**Check active users:**
```
/admin users
```

**View system health:**
```
/admin stats
```

**Emergency session kill:**
```
/admin kill <userId>
```

**Audit whitelist:**
```
/admin whitelist list
```

**Revoke access:**
```
/admin revoke <userId>
/admin whitelist remove <userId>
```

---

## Troubleshooting

### "Insufficient Privileges"

**Problem:** User cannot access admin commands

**Solution:**
- Check user role: They need admin or superadmin
- Grant role: `/admin grant <userId> admin` (superadmin only)
- Verify whitelist: User must be whitelisted first

### "Cannot Modify Own Role"

**Problem:** Superadmin trying to change their own role

**Solution:**
- This is by design for safety
- Ask another superadmin to modify your role
- Or create new superadmin first, then switch

### Migration Failed

**Problem:** Whitelist migration script fails

**Solution:**
1. Check `.env` file exists and has `ALLOWED_USERS`
2. Check database file is writable
3. Run with verbose logging:
   ```bash
   DEBUG=true node src/database/migrations/migrate-whitelist.js
   ```

### Whitelist Not Working

**Problem:** Whitelisted user cannot access

**Solution:**
1. Check `WHITELIST_MODE` in `.env`
2. Verify user in database: `/admin whitelist list`
3. Check audit logs for removals
4. Verify phone number format (no +, no spaces)

---

## Advanced Usage

### Programmatic Access

```javascript
import { SessionDatabase } from './src/database/session-db.js';

const db = new SessionDatabase();

// Check role
const role = db.getUserRole('6281234567890');
if (db.isAdmin('6281234567890')) {
  // User is admin or superadmin
}

// Grant role
db.setUserRole('6281234567890', 'admin', 'system');

// Add to whitelist
db.addToWhitelist('6281234567890', 'system', 'Automated addition');

// Log action
db.logAudit('admin_id', 'CUSTOM_ACTION', 'target', 'details');

// Get stats
const stats = db.getSystemStats();
console.log(stats);
```

### Bulk Operations

**Bulk whitelist addition:**
```javascript
const users = [
  { phone: '6281111111111', notes: 'Team Member 1' },
  { phone: '6282222222222', notes: 'Team Member 2' },
  { phone: '6283333333333', notes: 'Team Member 3' }
];

for (const user of users) {
  db.addToWhitelist(user.phone, 'admin', user.notes);
}
```

---

## Summary

Phase 9 provides complete multi-user management:

- ✅ Role-based access control (user/admin/superadmin)
- ✅ Database-backed whitelist management
- ✅ Active session monitoring and control
- ✅ System-wide statistics
- ✅ Complete audit trail
- ✅ Configuration hot-reload
- ✅ Security best practices

All admin commands are accessed via `/admin <subcommand>`.

For questions or issues, refer to the [Implementation Summary](./PHASE9_IMPLEMENTATION_SUMMARY.md).
