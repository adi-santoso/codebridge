/**
 * Whitelist Migration Script
 *
 * Migrates whitelist from .env (ALLOWED_USERS) to database
 *
 * Usage:
 * node src/database/migrations/migrate-whitelist.js
 *
 * Or call programmatically:
 * import { migrateWhitelist } from './src/database/migrations/migrate-whitelist.js';
 * await migrateWhitelist(db);
 */

import { config } from 'dotenv';
import { SessionDatabase } from '../session-db.js';
import { Logger } from '../../utils/logger.js';

const logger = new Logger('WhitelistMigration');

/**
 * Migrate whitelist from .env to database
 * @param {SessionDatabase} [db] - Optional database instance (creates one if not provided)
 * @returns {Promise<Object>} Migration result
 */
export async function migrateWhitelist(db = null) {
  logger.info('Starting whitelist migration from .env to database...');

  const shouldCloseDb = !db;

  try {
    // Load .env if not already loaded
    config();

    // Create database instance if not provided
    if (!db) {
      db = new SessionDatabase();
    }

    // Get ALLOWED_USERS from .env
    const allowedUsersEnv = process.env.ALLOWED_USERS || '';

    if (!allowedUsersEnv) {
      logger.warn('No ALLOWED_USERS found in .env - nothing to migrate');
      return {
        success: true,
        migrated: 0,
        skipped: 0,
        errors: [],
        message: 'No users to migrate'
      };
    }

    // Parse comma-separated phone numbers
    const phoneNumbers = allowedUsersEnv
      .split(',')
      .map(num => num.trim())
      .filter(num => num.length > 0);

    if (phoneNumbers.length === 0) {
      logger.warn('ALLOWED_USERS is empty - nothing to migrate');
      return {
        success: true,
        migrated: 0,
        skipped: 0,
        errors: [],
        message: 'No users to migrate'
      };
    }

    logger.info(`Found ${phoneNumbers.length} phone numbers in ALLOWED_USERS`);

    let migrated = 0;
    let skipped = 0;
    const errors = [];

    // Check initial superadmin
    const initialSuperadmin = process.env.SUPERADMIN_INITIAL || '';

    // Migrate each phone number
    for (const phoneNumber of phoneNumbers) {
      try {
        // Check if already in database
        const existing = db.isWhitelisted(phoneNumber);

        if (existing) {
          logger.debug(`Skipping ${phoneNumber} - already in database`);
          skipped++;
          continue;
        }

        // Add to database
        const notes = phoneNumber === initialSuperadmin
          ? 'Initial superadmin (migrated from .env)'
          : 'Migrated from .env ALLOWED_USERS';

        db.addToWhitelist(phoneNumber, 'system', notes);

        // If this is the initial superadmin, also grant role
        if (phoneNumber === initialSuperadmin) {
          const currentRole = db.getUserRole(phoneNumber);
          if (currentRole !== 'superadmin') {
            db.setUserRole(phoneNumber, 'superadmin', 'system');
            logger.info(`Granted superadmin role to ${phoneNumber}`);
          }
        }

        migrated++;
        logger.success(`Migrated ${phoneNumber}`);

      } catch (error) {
        logger.error(`Failed to migrate ${phoneNumber}: ${error.message}`);
        errors.push({
          phoneNumber,
          error: error.message
        });
      }
    }

    const result = {
      success: errors.length === 0,
      migrated,
      skipped,
      errors,
      message: `Migrated ${migrated} numbers, skipped ${skipped}, failed ${errors.length}`
    };

    logger.info('Whitelist migration completed:', result.message);

    return result;

  } catch (error) {
    logger.error(`Whitelist migration failed: ${error.message}`);
    throw error;
  } finally {
    // Close database if we created it
    if (shouldCloseDb && db) {
      db.close();
    }
  }
}

/**
 * Check if migration is needed
 * @param {SessionDatabase} [db] - Optional database instance
 * @returns {Promise<boolean>} True if migration needed
 */
export async function isMigrationNeeded(db = null) {
  const shouldCloseDb = !db;

  try {
    // Load .env if not already loaded
    config();

    // Create database instance if not provided
    if (!db) {
      db = new SessionDatabase();
    }

    // Get ALLOWED_USERS from .env
    const allowedUsersEnv = process.env.ALLOWED_USERS || '';

    if (!allowedUsersEnv) {
      return false; // Nothing to migrate
    }

    // Parse phone numbers
    const phoneNumbers = allowedUsersEnv
      .split(',')
      .map(num => num.trim())
      .filter(num => num.length > 0);

    if (phoneNumbers.length === 0) {
      return false;
    }

    // Check if any number is NOT in database
    for (const phoneNumber of phoneNumbers) {
      const whitelist = db.getWhitelist();
      const existsInDb = whitelist.some(entry => entry.phoneNumber === phoneNumber);

      if (!existsInDb) {
        return true; // At least one number needs migration
      }
    }

    return false; // All numbers already in database

  } finally {
    if (shouldCloseDb && db) {
      db.close();
    }
  }
}

/**
 * CLI entry point
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      const result = await migrateWhitelist();

      console.log('\n=== Whitelist Migration Result ===\n');
      console.log(`Migrated: ${result.migrated}`);
      console.log(`Skipped: ${result.skipped}`);
      console.log(`Failed: ${result.errors.length}`);

      if (result.errors.length > 0) {
        console.log('\nErrors:');
        for (const err of result.errors) {
          console.log(`  - ${err.phoneNumber}: ${err.error}`);
        }
      }

      console.log(`\n${result.message}\n`);

      process.exit(result.success ? 0 : 1);

    } catch (error) {
      console.error('\n=== Migration Failed ===\n');
      console.error(error.message);
      console.error(error.stack);
      process.exit(1);
    }
  })();
}

export default {
  migrateWhitelist,
  isMigrationNeeded
};
