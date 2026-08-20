import { Injectable, inject, isDevMode } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { UbicacionRepository } from '../../domain/ubicacion/repositories/ubicacion.repository';

@Injectable({ providedIn: 'root' })
export class SqliteUbicacionRepository implements UbicacionRepository {
  private connection = inject(SqliteConnectionService);

  async insert(zonaId: number, codigo: string, tag: string): Promise<number> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const codigoNormalizado = codigo.trim().toUpperCase();
    const tagNormalizado = tag.trim().toUpperCase();

    /*
     * Un TAG es una etiqueta física, no un identificador único: la misma
     * numeración se vuelve a usar en otra jornada, en otra ronda, o porque el
     * operador vuelve a pegar una etiqueta sobre la misma repisa. Cada vez que
     * se abre para contar es un objeto distinto, y merece su propia fila.
     *
     * La única reutilización válida es retomar un conteo que sigue abierto —
     * volver atrás en la app, reiniciar el equipo—: ahí la fila tiene líneas
     * EN_CURSO y devolverla es lo que recupera la sesión. Si sus líneas ya se
     * cerraron, se crea una fila nueva; reutilizarla hacía que el conteo nuevo
     * chocara contra el UNIQUE de sod_conteo_detalle al repetir un SKU.
     */
    const reutilizable = await db.query(
      `SELECT u.id
       FROM sod_ubicacion u
       WHERE u.zona_id = ? AND u.codigo = ? AND u.tag = ?
         AND NOT EXISTS (
           SELECT 1 FROM sod_conteo_detalle d
           WHERE d.ubicacion_id = u.id AND d.estado <> 'EN_CURSO'
         )
       ORDER BY u.id DESC
       LIMIT 1`,
      [zonaId, codigoNormalizado, tagNormalizado]
    );
    const existingId = (reutilizable.values?.[0] as Record<string, unknown> | undefined)?.['id'] as number | undefined;
    if (existingId !== undefined) {
      if (isDevMode()) console.log('[UbicacionRepo] retoma sod_ubicacion abierta', { id: existingId, zonaId, codigo: codigoNormalizado, tag: tagNormalizado });
      return existingId;
    }

    await db.run(
      `INSERT INTO sod_ubicacion (zona_id, codigo, tag) VALUES (?, ?, ?)`,
      [zonaId, codigoNormalizado, tagNormalizado]
    );
    const result = await db.query(
      `SELECT id FROM sod_ubicacion WHERE zona_id = ? AND codigo = ? AND tag = ? ORDER BY id DESC LIMIT 1`,
      [zonaId, codigoNormalizado, tagNormalizado]
    );
    const id = (result.values?.[0] as Record<string, unknown>)?.['id'] as number;
    if (isDevMode()) {
      console.log('[UbicacionRepo] INSERT sod_ubicacion', { id, zonaId, codigo: codigoNormalizado, tag: tagNormalizado });
      const snapshot = await db.query(`SELECT * FROM sod_ubicacion ORDER BY id DESC LIMIT 10`);
      console.table(snapshot.values ?? []);
    }
    return id;
  }
}
