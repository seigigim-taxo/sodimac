import { Injectable, inject } from '@angular/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { MigrationRegistry } from './migrations/migration-registry.service';

const DB_NAME = 'sodimac_app';

@Injectable({ providedIn: 'root' })
export class SqliteConnectionService {
  private sqlite = new SQLiteConnection(CapacitorSQLite);
  private migrationRegistry: MigrationRegistry;
  private db: SQLiteDBConnection | null = null;
  private initialized = false;

  constructor(migrationRegistry: MigrationRegistry = inject(MigrationRegistry)) {
    this.migrationRegistry = migrationRegistry;
  }

  async connect(): Promise<void> {
    if (this.initialized && this.db) return;

    try {
      await this.sqlite.checkConnectionsConsistency();

      const migrations = this.migrationRegistry.getMigrations();
      const latestVersion = this.migrationRegistry.getLatestVersion();

      if (migrations.length > 0) {
        await this.sqlite.addUpgradeStatement(
          DB_NAME,
          migrations.map((m) => ({ toVersion: m.version, statements: m.statements }))
        );
      }

      const isConn = await this.sqlite.isConnection(DB_NAME, false);
      if (isConn.result) {
        this.db = await this.sqlite.retrieveConnection(DB_NAME, false);
      } else {
        this.db = await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', latestVersion, false);
      }

      const isOpen = await this.db.isDBOpen();
      if (!isOpen.result) {
        await this.db.open();
      }

      this.initialized = true;
    } catch (err) {
      console.error('[SqliteConnectionService] connect failed:', err);
      this.db = null;
      this.initialized = false;
      throw err;
    }
  }

  getDb(): SQLiteDBConnection {
    if (!this.initialized || !this.db) {
      throw new Error('SqliteConnectionService not initialized. Call connect() first.');
    }
    return this.db;
  }

  async close(): Promise<void> {
    if (!this.db) return;
    await this.sqlite.closeConnection(DB_NAME, false);
    this.db = null;
    this.initialized = false;
  }
}
