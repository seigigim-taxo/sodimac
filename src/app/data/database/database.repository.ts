// ============================================================
// data/database/database.repository.ts
// Implementacion SQLite del DatabaseRepository: abre/crea la
// base local "sodimac" y aplica el esquema (tablas vacias) que
// espeja taxochil_ac-sodimac. Punto de entrada del offline-first.
// ============================================================

import { Injectable, inject, isDevMode } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { DatabaseRepository } from '../../domain/database/repositories/database.repository';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME, SODIMAC_DB_VERSION, SODIMAC_TABLE_NAMES, SODIMAC_SCHEMA_SQL } from '../../core/database/sodimac.schema';

const TAG = '[SqliteDatabaseRepository]';
const VERSION_KEY = 'sodimac_db_version_aplicada';

@Injectable({ providedIn: 'root' })
export class SqliteDatabaseRepository implements DatabaseRepository {
  private connection = inject(SqliteConnectionService);

  async initialize(): Promise<void> {
    if (!this.connection.isSupported) {
      if (isDevMode()) console.log(`${TAG} plataforma no nativa (web) - se omite la inicializacion de SQLite`);
      return;
    }

    if (isDevMode()) console.log(`${TAG} inicializando base "${SODIMAC_DB_NAME}" (schema v${SODIMAC_DB_VERSION})...`);

    try {
      const db = await this.connection.getConnection(SODIMAC_DB_NAME);

      /*
       * Wipe controlado por versión: las tablas se dropean SOLO cuando
       * SODIMAC_DB_VERSION cambió desde la última inicialización.
       * Un live reload o reinicio con la misma versión conserva todos los
       * datos (conteos incluidos). Para partir con DB limpia en desarrollo,
       * basta subir SODIMAC_DB_VERSION en sodimac.schema.ts.
       */
      const { value } = await Preferences.get({ key: VERSION_KEY });
      const versionAplicada = value ? Number(value) : null;

      if (versionAplicada !== SODIMAC_DB_VERSION) {
        if (isDevMode()) console.log(`${TAG} version ${versionAplicada ?? 'ninguna'} → ${SODIMAC_DB_VERSION}: recreando todas las tablas`);
        await db.execute('PRAGMA foreign_keys = OFF;');
        // Tablas activas en orden inverso de dependencias FK + legacy de versiones antiguas.
        const activasReversa = [...SODIMAC_TABLE_NAMES].reverse()
          .map((t) => `DROP TABLE IF EXISTS ${t};`).join('\n');
        await db.execute(`
          ${activasReversa}
          DROP TABLE IF EXISTS cat_operador;
          DROP TABLE IF EXISTS cat_zona;
          DROP TABLE IF EXISTS cat_ubicacion;
          DROP TABLE IF EXISTS cat_muestra_info;
          DROP TABLE IF EXISTS cat_producto;
          DROP TABLE IF EXISTS conteo_local;
          DROP TABLE IF EXISTS sesion_trabajo;
          DROP TABLE IF EXISTS sod_agenda_muestra;
          DROP TABLE IF EXISTS sod_muestra_codigo;
          DROP TABLE IF EXISTS sod_producto_barra;
          DROP TABLE IF EXISTS sod_evento;
        `);
        await db.execute('PRAGMA foreign_keys = ON;');
      }

      if (isDevMode()) console.log(`${TAG} aplicando esquema:`, [...SODIMAC_TABLE_NAMES]);
      await db.execute(SODIMAC_SCHEMA_SQL);

      const result = await db.query(
        `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`
      );
      const createdTables = (result.values ?? []).map((row: Record<string, unknown>) => row['name'] as string);
      const missing = SODIMAC_TABLE_NAMES.filter((name) => !createdTables.includes(name));

      if (missing.length > 0) {
        console.error(`${TAG} faltan tablas tras aplicar el esquema:`, missing);
        return;
      }

      // La versión se persiste solo cuando el esquema quedó aplicado completo.
      await Preferences.set({ key: VERSION_KEY, value: String(SODIMAC_DB_VERSION) });
      if (isDevMode()) console.log(`${TAG} listo - ${createdTables.length}/${SODIMAC_TABLE_NAMES.length} tablas verificadas`);
    } catch (err) {
      console.error(`${TAG} fallo al inicializar la base local:`, err);
    }
  }
}
