import { Injectable, inject, isDevMode } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { UbicacionRepository } from '../../domain/ubicacion/repositories/ubicacion.repository';

@Injectable({ providedIn: 'root' })
export class SqliteUbicacionRepository implements UbicacionRepository {
  private connection = inject(SqliteConnectionService);

  async insert(zonaId: number, tag: string): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `INSERT INTO sod_ubicacion (zona_id, codigo, tag) VALUES (?, ?, ?)`,
      [zonaId, tag, tag]
    );
    if (isDevMode()) {
      console.log('[UbicacionRepo] INSERT sod_ubicacion', { zonaId, codigo: tag, tag });
      const snapshot = await db.query(`SELECT * FROM sod_ubicacion ORDER BY id DESC LIMIT 10`);
      console.table(snapshot.values ?? []);
    }
  }
}
