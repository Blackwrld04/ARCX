import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { runMigrations } from './migrate.js';

let db;

export function initDatabase() {
  const dbDir = dirname(config.dbPath);
  mkdirSync(dbDir, { recursive: true });

  db = new Database(config.dbPath);

  // Performance + safety pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Run versioned migrations
  runMigrations(db);

  logger.info({ dbPath: config.dbPath }, 'Database initialized');
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized — call initDatabase() first');
  }
  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
    logger.info('Database closed');
  }
}
