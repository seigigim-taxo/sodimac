<<<<<<< HEAD
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
=======
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
    /*
     * En web el plugin exige el elemento jeep-sqlite en el DOM y falla con un
     * error que no dice nada del contexto. Se corta antes con un mensaje que sí
     * explica qué pasa: sin esto, cualquier consulta desde `ng serve` terminaba
     * en una pantalla en blanco.
     */
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
      /*
       * El rollback va en su propio try: si también falla, el error que importa
       * es el original, no el del rollback.
       */
      try {
        await db.rollbackTransaction();
      } catch (errRollback) {
        console.error(`${TAG} falló el rollback:`, errRollback);
      }
      throw err;
    }
  }
>>>>>>> feat/modo-analista-maqueta
}
