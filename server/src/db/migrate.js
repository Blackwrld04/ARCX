import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

/**
 * Run all pending migrations in order, inside exclusive transactions.
 *
 * - Reads numbered .sql files from migrations/
 * - Checks schema_migrations table for already-applied versions
 * - Applies pending migrations in a single transaction each
 * - Uses BEGIN EXCLUSIVE to prevent concurrent migration runs
 */
export function runMigrations(db) {
  // Ensure schema_migrations table exists (bootstrap)
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Read migration files, sorted by version number
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => {
      const vA = parseInt(a.split('_')[0], 10);
      const vB = parseInt(b.split('_')[0], 10);
      return vA - vB;
    });

  if (files.length === 0) {
    logger.warn('No migration files found');
    return;
  }

  // Get already-applied versions
  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version)
  );

  let appliedCount = 0;

  for (const file of files) {
    const version = parseInt(file.split('_')[0], 10);
    if (isNaN(version)) {
      logger.warn({ file }, 'Skipping migration file with invalid version number');
      continue;
    }

    if (applied.has(version)) {
      continue;
    }

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    const name = file.replace('.sql', '');

    // BEGIN EXCLUSIVE prevents any other connection from writing during migration
    const migrate = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(version, name);
    });

    try {
      migrate();
      appliedCount++;
      logger.info({ version, name }, 'Migration applied');
    } catch (err) {
      logger.error({ err: err.message, version, name }, 'Migration failed');
      throw err;
    }
  }

  if (appliedCount === 0) {
    logger.debug('All migrations already applied');
  } else {
    logger.info({ count: appliedCount }, 'Migrations complete');
  }
}
