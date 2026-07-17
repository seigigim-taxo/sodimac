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
    if (this.initialized && this.db) {
      console.log('[SqliteConnectionService] already initialized');
      return;
    }

    try {
      await this.sqlite.checkConnectionsConsistency();

      const dbList = await this.sqlite.getDatabaseList();
      const dbExists = dbList.values?.includes(DB_NAME) ?? false;
      console.log(`[SqliteConnectionService] database '${DB_NAME}' exists: ${dbExists}`);

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
        console.log('[SqliteConnectionService] retrieving existing connection');
        this.db = await this.sqlite.retrieveConnection(DB_NAME, false);
      } else {
        console.log(`[SqliteConnectionService] creating connection (version ${latestVersion})`);
        this.db = await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', latestVersion, false);
      }

      const isOpen = await this.db.isDBOpen();
      if (!isOpen.result) {
        console.log('[SqliteConnectionService] opening database');
        await this.db.open();
      } else {
        console.log('[SqliteConnectionService] database already open');
      }

      await this.db.execute('PRAGMA foreign_keys = ON;');
      const fkResult = await this.db.query('PRAGMA foreign_keys;');
      console.log(`[SqliteConnectionService] foreign_keys enabled: ${fkResult.values?.[0]?.foreign_keys ?? 'unknown'}`);

      const tableResult = await this.db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
      const tables = (tableResult.values ?? []).map((row: any) => row.name);
      console.log(`[SqliteConnectionService] tables created (${tables.length}):`, tables.join(', '));

      this.initialized = true;
      console.log('[SqliteConnectionService] initialized successfully');
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
