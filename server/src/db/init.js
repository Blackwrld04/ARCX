import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { runMigrations } from './migrate.js';

let db;

export function initDatabase(customPath) {
  const dbPath = customPath || config.dbPath;
  if (dbPath !== ':memory:') {
    const dbDir = dirname(dbPath);
    mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);

  // Performance + safety pragmas
  if (dbPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Run versioned migrations
  runMigrations(db);

  logger.info({ dbPath }, 'Database initialized');
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
