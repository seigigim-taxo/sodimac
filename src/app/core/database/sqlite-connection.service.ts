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
    if (!this.isSupported) {
      throw new Error(`${TAG} SQLite solo está disponible en plataforma nativa (Android/iOS). En web no hay base local.`);
    }

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

  async deleteDatabase(dbName: string): Promise<void> {
    if (!this.isSupported) {
      throw new Error(`${TAG} SQLite solo está disponible en plataforma nativa (Android/iOS). En web no hay base local.`);
    }

    const cached = this.connections.get(dbName);
    if (cached) {
      try {
        await cached.delete();
      } catch {
        // ignore delete errors
      }
      this.connections.delete(dbName);
    }

    await this.sqlite.closeConnection(dbName, false);
  }

  /*
   * Ejecuta `fn` dentro de una transacción: o se escribe todo o no se escribe
   * nada. Sin esto, una escritura que toca varias tablas puede fallar a mitad y
   * dejar filas huérfanas — una sucursal sin su vínculo al operador, o una
   * muestra sin detalle.
   *
   * IMPORTANTE: los `db.run()` de adentro deben pasar `false` como tercer
   * argumento. Ese parámetro vale `true` por default y hace que cada statement
   * abra y cierre su propia transacción, que es justo lo que se quiere evitar.
   */
  async enTransaccion<T>(dbName: string, fn: (db: SQLiteDBConnection) => Promise<T>): Promise<T> {
    const db = await this.getConnection(dbName);
    await db.beginTransaction();
    try {
      const resultado = await fn(db);
      await db.commitTransaction();
      return resultado;
    } catch (err) {
      try {
        await db.rollbackTransaction();
      } catch (errRollback) {
        console.error(`${TAG} falló el rollback:`, errRollback);
      }
      throw err;
    }
  }
}
