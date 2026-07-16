import { Migration } from '../../core/database/migrations/migration.model';

export const countingMigration: Migration = {
  version: 1,
  name: 'create-counting-sessions',
  statements: [
    `CREATE TABLE IF NOT EXISTS counting_sessions (
      id TEXT PRIMARY KEY,
      tag TEXT NOT NULL,
      zone TEXT NOT NULL,
      status TEXT NOT NULL,
      synced INTEGER DEFAULT 0,
      edited INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      items TEXT NOT NULL,
      total_items INTEGER DEFAULT 0,
      total_quantity INTEGER DEFAULT 0
    );`,
  ],
};
