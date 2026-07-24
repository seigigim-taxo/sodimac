import { Injectable, inject, isDevMode } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { UbicacionRepository } from '../../domain/ubicacion/repositories/ubicacion.repository';

@Injectable({ providedIn: 'root' })
export class SqliteUbicacionRepository implements UbicacionRepository {
  private connection = inject(SqliteConnectionService);

  async insert(zonaId: number, tag: string): Promise<number> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    /*
     * sod_ubicacion no tiene UNIQUE(zona_id, tag) en el schema, así que la
     * idempotencia se resuelve aquí: si el par ya existe se reutiliza su id
     * (reingresar a la misma ubicación no debe crear filas duplicadas).
     */
    const existing = await db.query(
      `SELECT id FROM sod_ubicacion WHERE zona_id = ? AND tag = ? ORDER BY id DESC LIMIT 1`,
      [zonaId, tag]
    );
    const existingId = (existing.values?.[0] as Record<string, unknown> | undefined)?.['id'] as number | undefined;
    if (existingId !== undefined) {
      if (isDevMode()) console.log('[UbicacionRepo] reutiliza sod_ubicacion existente', { id: existingId, zonaId, tag });
      return existingId;
    }

    await db.run(
      `INSERT INTO sod_ubicacion (zona_id, codigo, tag) VALUES (?, ?, ?)`,
      [zonaId, tag, tag]
    );
    const result = await db.query(
      `SELECT id FROM sod_ubicacion WHERE zona_id = ? AND tag = ? ORDER BY id DESC LIMIT 1`,
      [zonaId, tag]
    );
    const id = (result.values?.[0] as Record<string, unknown>)?.['id'] as number;
    if (isDevMode()) {
      console.log('[UbicacionRepo] INSERT sod_ubicacion', { id, zonaId, codigo: tag, tag });
      const snapshot = await db.query(`SELECT * FROM sod_ubicacion ORDER BY id DESC LIMIT 10`);
      console.table(snapshot.values ?? []);
    }
    return id;
  }
}
