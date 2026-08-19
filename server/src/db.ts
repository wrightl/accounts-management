import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = Database.Database;

/**
 * Open (and initialise) a SQLite database. Pass ':memory:' for an ephemeral
 * database, which is what the test-suite uses to stay isolated.
 */
export function openDatabase(location: string): DB {
  if (location !== ':memory:') {
    mkdirSync(dirname(location), { recursive: true });
  }

  const db = new Database(location);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      type       TEXT NOT NULL,
      currency   TEXT NOT NULL DEFAULT 'USD',
      balance    INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id          TEXT PRIMARY KEY,
      account_id  TEXT NOT NULL,
      amount      INTEGER NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_account
      ON transactions (account_id, created_at);
  `);

  return db;
}
