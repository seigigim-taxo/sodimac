import { Injectable, inject, isDevMode } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { ResultadoUbicacion, UbicacionRepository } from '../../domain/ubicacion/repositories/ubicacion.repository';

@Injectable({ providedIn: 'root' })
export class SqliteUbicacionRepository implements UbicacionRepository {
  private connection = inject(SqliteConnectionService);

  async insert(
    zonaId: number, codigo: string, tag: string,
    conteoId: number, operadorId: number, pdaId: number
  ): Promise<ResultadoUbicacion> {
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
      return { ubicacionId: existingId, reabierta: false, ubicacionSincronizadaId: null };
    }

    /*
     * ¿Ese mismo TAG está FINALIZADO —contado, pero sin sincronizar— en ESTA
     * ronda, de este operador y esta PDA? Si es así no es un objeto nuevo: es
     * el mismo TAG que se cerró y el operador volvió a escanear, y hay que
     * seguir contándolo ahí en vez de tirar una fila aparte. Se reabre igual
     * que "Editar" desde el resumen (ver ReabrirTagUseCase) — es la misma
     * regla, disparada por el escaneo en vez de un botón.
     *
     * Acotado a esta ronda: un TAG finalizado en una iteración anterior no se
     * reabre por coincidir el número — esa ronda ya está cerrada y reabrirla
     * de paso sería un cambio que nadie pidió.
     */
    const finalizada = await db.query(
      `SELECT u.id
       FROM sod_ubicacion u
       WHERE u.zona_id = ? AND u.codigo = ? AND u.tag = ?
         AND EXISTS (
           SELECT 1 FROM sod_conteo_detalle d
           WHERE d.ubicacion_id = u.id AND d.conteo_id = ?
             AND d.operador_id = ? AND d.pda_id = ? AND d.estado = 'FINALIZADO'
         )
       ORDER BY u.id DESC
       LIMIT 1`,
      [zonaId, codigoNormalizado, tagNormalizado, conteoId, operadorId, pdaId]
    );
    const finalizadaId = (finalizada.values?.[0] as Record<string, unknown> | undefined)?.['id'] as number | undefined;
    if (finalizadaId !== undefined) {
      await db.run(
        `UPDATE sod_conteo_detalle
         SET estado = 'EN_CURSO'
         WHERE conteo_id = ? AND ubicacion_id = ?
           AND operador_id = ? AND pda_id = ? AND estado = 'FINALIZADO'`,
        [conteoId, finalizadaId, operadorId, pdaId]
      );
      if (isDevMode()) console.log('[UbicacionRepo] reabre sod_ubicacion finalizada', { id: finalizadaId, zonaId, codigo: codigoNormalizado, tag: tagNormalizado });
      return { ubicacionId: finalizadaId, reabierta: true, ubicacionSincronizadaId: null };
    }

    /*
     * ¿Y si ya está SINCRONIZADA? Esa NO se reabre — ya viajó al SGO y
     * corregirla ahí dejaría a la PDA diciendo una cosa y el servidor otra.
     * Se crea una fila nueva, como cualquier TAG sin coincidencia, pero se
     * informa el id de la vieja: la pantalla de conteo la va a mostrar de
     * solo lectura, a modo de referencia de lo que ya se contó ahí antes.
     *
     * Si hubiera más de una sincronizada con el mismo número en esta ronda
     * (caso raro), se toma la más reciente — es la que probablemente le
     * importa al operador.
     */
    const sincronizada = await db.query(
      `SELECT u.id
       FROM sod_ubicacion u
       WHERE u.zona_id = ? AND u.codigo = ? AND u.tag = ?
         AND EXISTS (
           SELECT 1 FROM sod_conteo_detalle d
           WHERE d.ubicacion_id = u.id AND d.conteo_id = ?
             AND d.operador_id = ? AND d.pda_id = ? AND d.estado = 'SINCRONIZADO'
         )
       ORDER BY u.id DESC
       LIMIT 1`,
      [zonaId, codigoNormalizado, tagNormalizado, conteoId, operadorId, pdaId]
    );
    const ubicacionSincronizadaId = (sincronizada.values?.[0] as Record<string, unknown> | undefined)?.['id'] as number | undefined ?? null;

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
      console.log('[UbicacionRepo] INSERT sod_ubicacion', { id, zonaId, codigo: codigoNormalizado, tag: tagNormalizado, ubicacionSincronizadaId });
      const snapshot = await db.query(`SELECT * FROM sod_ubicacion ORDER BY id DESC LIMIT 10`);
      console.table(snapshot.values ?? []);
    }
    return { ubicacionId: id, reabierta: false, ubicacionSincronizadaId };
  }
}
