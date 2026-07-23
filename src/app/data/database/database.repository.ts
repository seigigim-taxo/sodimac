// ============================================================
// data/database/database.repository.ts
// Implementacion SQLite del DatabaseRepository: abre/crea la
// base local "sodimac" y aplica el esquema (tablas vacias) que
// espeja taxochil_ac-sodimac. Punto de entrada del offline-first.
// ============================================================

import { Injectable, inject } from '@angular/core';
import { DatabaseRepository } from '../../domain/database/repositories/database.repository';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME, SODIMAC_TABLE_NAMES, SODIMAC_SCHEMA_SQL } from '../../core/database/sodimac.schema';

const TAG = '[SqliteDatabaseRepository]';

@Injectable({ providedIn: 'root' })
export class SqliteDatabaseRepository implements DatabaseRepository {
  private connection = inject(SqliteConnectionService);

  async initialize(): Promise<void> {
    if (!this.connection.isSupported) {
      console.log(`${TAG} plataforma no nativa (web) - se omite la inicializacion de SQLite`);
      return;
    }

    console.log(`${TAG} inicializando base "${SODIMAC_DB_NAME}"...`);

    try {
      const db = await this.connection.getConnection(SODIMAC_DB_NAME);
      await db.execute('PRAGMA foreign_keys = OFF;');
      // Drops acumulativos de versiones anteriores (el orden evita FK colgantes)
      // Solo se dropean tablas de versiones anteriores del schema.
      // Las tablas activas se crean con IF NOT EXISTS — no se tocan si ya existen.
      await db.execute(`
        DROP TABLE IF EXISTS cat_operador;
        DROP TABLE IF EXISTS cat_zona;
        DROP TABLE IF EXISTS cat_ubicacion;
        DROP TABLE IF EXISTS cat_muestra_info;
        DROP TABLE IF EXISTS cat_producto;
        DROP TABLE IF EXISTS conteo_local;
        DROP TABLE IF EXISTS sod_conteo;
        DROP TABLE IF EXISTS sesion_trabajo;
        DROP TABLE IF EXISTS sod_agenda_muestra;
        DROP TABLE IF EXISTS sod_muestra_detalle;
        DROP TABLE IF EXISTS sod_muestra_codigo;
        DROP TABLE IF EXISTS sod_muestra;
        DROP TABLE IF EXISTS sod_producto_barra;
        DROP TABLE IF EXISTS sod_producto;
        DROP TABLE IF EXISTS sod_evento;
      `);
      await db.execute('PRAGMA foreign_keys = ON;');
      console.log(`${TAG} creando tablas:`, [...SODIMAC_TABLE_NAMES]);
      await db.execute(SODIMAC_SCHEMA_SQL);

      const result = await db.query(
        `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`
      );
      const createdTables = (result.values ?? []).map((row: Record<string, unknown>) => row['name'] as string);
      const missing = SODIMAC_TABLE_NAMES.filter((name) => !createdTables.includes(name));

      if (missing.length > 0) {
        console.error(`${TAG} faltan tablas tras aplicar el esquema:`, missing);
      } else {
        console.log(`${TAG} listo - ${createdTables.length}/${SODIMAC_TABLE_NAMES.length} tablas creadas:`, createdTables);
      }
    } catch (err) {
      console.error(`${TAG} fallo al inicializar la base local:`, err);
    }
  }
}
