// ============================================================
// core/database/sqlite-connection.service.ts
// Wrapper de bajo nivel sobre @capacitor-community/sqlite.
// Solo disponible en plataforma nativa (Android/iOS); en web
// (ng serve, karma) queda inactivo hasta que se agregue jeep-sqlite.
// ============================================================

import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { SODIMAC_DB_VERSION } from './sodimac.schema';
const TAG = '[SqliteConnectionService]';

@Injectable({ providedIn: 'root' })
export class SqliteConnectionService {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private readonly connections = new Map<string, SQLiteDBConnection>();

  get isSupported(): boolean {
    return Capacitor.isNativePlatform();
  }

  async getConnection(dbName: string): Promise<SQLiteDBConnection> {
    const cached = this.connections.get(dbName);
    if (cached) {
      return cached;
    }

    const consistency = await this.sqlite.checkConnectionsConsistency();
    const alreadyOpen = (await this.sqlite.isConnection(dbName, false)).result;

    const db = consistency.result && alreadyOpen
      ? await this.sqlite.retrieveConnection(dbName, false)
      : await this.sqlite.createConnection(dbName, false, 'no-encryption', SODIMAC_DB_VERSION, false);

    await db.open();
    this.connections.set(dbName, db);
    return db;
  }
}
