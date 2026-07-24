import { Injectable, inject, isDevMode } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoItem } from '../../domain/conteo/models/conteo-item.model';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
import { EstadoConteo } from '../../domain/conteo/models/estado-conteo.model';

// JOIN reutilizado en fetchOne y getBySesion
const SELECT_ITEM = `
  SELECT c.id, c.evento_id, c.ubicacion_id, c.producto_id,
         c.operador_id, c.pda_id, c.cantidad_fisica, c.estado, c.fecha_hora,
         p.sku, p.descripcion
  FROM sod_conteo c
  JOIN sod_producto p ON p.id = c.producto_id
`;

@Injectable({ providedIn: 'root' })
export class SqliteConteoRepository implements ConteoRepository {
  private connection = inject(SqliteConnectionService);

  /*
   * upsert / adjust / delete operan solo sobre filas EN_CURSO: un conteo
   * FINALIZADO o SINCRONIZADO es inmutable desde la sesión de trabajo.
   * La atomicidad del par SELECT → INSERT/UPDATE la garantiza el ConteoFacade,
   * que serializa todas las escrituras en una cola.
   */
  async upsert(
    eventoId: number, ubicacionId: number,
    productoId: number, operadorId: number, pdaId: number,
    cantidad: number
  ): Promise<ConteoItem> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    const existing = await db.query(
      `SELECT id FROM sod_conteo
       WHERE evento_id = ? AND ubicacion_id = ? AND producto_id = ?
         AND operador_id = ? AND pda_id = ? AND estado = 'EN_CURSO'`,
      [eventoId, ubicacionId, productoId, operadorId, pdaId]
    );

    if (existing.values?.length) {
      // cantidad_fisica + cantidad se evalúa en SQLite sobre el valor real de la DB.
      const id = (existing.values[0] as Record<string, unknown>)['id'] as number;
      await db.run(
        `UPDATE sod_conteo
         SET cantidad_fisica = cantidad_fisica + ?,
             fecha_hora      = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [cantidad, id]
      );
    } else {
      // estado toma el DEFAULT 'EN_CURSO' del schema.
      await db.run(
        `INSERT INTO sod_conteo
           (evento_id, ubicacion_id, producto_id, operador_id, pda_id, cantidad_fisica)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [eventoId, ubicacionId, productoId, operadorId, pdaId, cantidad]
      );
    }

    return this.fetchOne(eventoId, ubicacionId, productoId, operadorId, pdaId);
  }

  async adjust(
    eventoId: number, ubicacionId: number,
    productoId: number, operadorId: number, pdaId: number,
    delta: number, estado: EstadoConteo
  ): Promise<ConteoItem> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    // MAX(1, ...) impide bajar de 1; para quitar el item se usa delete().
    await db.run(
      `UPDATE sod_conteo
       SET cantidad_fisica = MAX(1, cantidad_fisica + ?),
           fecha_hora      = CURRENT_TIMESTAMP
       WHERE evento_id = ? AND ubicacion_id = ? AND producto_id = ?
         AND operador_id = ? AND pda_id = ? AND estado = ?`,
      [delta, eventoId, ubicacionId, productoId, operadorId, pdaId, estado]
    );

    return this.fetchOne(eventoId, ubicacionId, productoId, operadorId, pdaId, estado);
  }

  async delete(
    eventoId: number, ubicacionId: number,
    productoId: number, operadorId: number, pdaId: number,
    estado: EstadoConteo
  ): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `DELETE FROM sod_conteo
       WHERE evento_id = ? AND ubicacion_id = ? AND producto_id = ?
         AND operador_id = ? AND pda_id = ? AND estado = ?`,
      [eventoId, ubicacionId, productoId, operadorId, pdaId, estado]
    );
    if (isDevMode()) {
      console.log('[ConteoRepo] DELETE item', { eventoId, ubicacionId, productoId, estado });
    }
  }

  async getBySesion(
    eventoId: number, ubicacionId: number,
    operadorId: number, pdaId: number,
    estado: EstadoConteo
  ): Promise<ConteoItem[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `${SELECT_ITEM}
       WHERE c.evento_id = ? AND c.ubicacion_id = ?
         AND c.operador_id = ? AND c.pda_id = ? AND c.estado = ?
       ORDER BY c.fecha_hora DESC`,
      [eventoId, ubicacionId, operadorId, pdaId, estado]
    );
    const items = (result.values ?? []).map((r) => this.map(r as Record<string, unknown>));
    if (isDevMode()) {
      console.log('[ConteoRepo] getBySesion', { eventoId, ubicacionId, estado });
      console.table(items);
    }
    return items;
  }

  async finalizarSesion(
    eventoId: number, ubicacionId: number, operadorId: number, pdaId: number
  ): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `UPDATE sod_conteo
       SET estado = 'FINALIZADO'
       WHERE evento_id = ? AND ubicacion_id = ?
         AND operador_id = ? AND pda_id = ? AND estado = 'EN_CURSO'`,
      [eventoId, ubicacionId, operadorId, pdaId]
    );
    if (isDevMode()) {
      console.log('[ConteoRepo] finalizarSesion', { eventoId, ubicacionId });
    }
  }

  async marcarSincronizado(
    eventoId: number, ubicacionId: number, operadorId: number, pdaId: number
  ): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `UPDATE sod_conteo
       SET estado = 'SINCRONIZADO'
       WHERE evento_id = ? AND ubicacion_id = ?
         AND operador_id = ? AND pda_id = ? AND estado = 'FINALIZADO'`,
      [eventoId, ubicacionId, operadorId, pdaId]
    );
    if (isDevMode()) {
      console.log('[ConteoRepo] marcarSincronizado', { eventoId, ubicacionId });
    }
  }

  async getResumenes(operadorId: number, pdaId: number): Promise<ConteoResumen[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT c.evento_id, c.ubicacion_id, c.operador_id, c.pda_id, c.estado,
              u.tag, z.codigo AS zona_codigo, z.nombre AS zona_nombre,
              COUNT(*)               AS total_productos,
              SUM(c.cantidad_fisica) AS total_unidades,
              MAX(c.fecha_hora)      AS fecha_ultima
       FROM sod_conteo c
       LEFT JOIN sod_ubicacion u ON u.id = c.ubicacion_id
       LEFT JOIN sod_zona z      ON z.id = u.zona_id
       WHERE c.operador_id = ? AND c.pda_id = ?
       GROUP BY c.evento_id, c.ubicacion_id, c.estado
       ORDER BY fecha_ultima DESC`,
      [operadorId, pdaId]
    );
    const resumenes = (result.values ?? []).map((r) => this.mapResumen(r as Record<string, unknown>));
    if (isDevMode()) {
      console.log('[ConteoRepo] getResumenes', { operadorId, pdaId });
      console.table(resumenes);
    }
    return resumenes;
  }

  async deleteSesion(
    eventoId: number, ubicacionId: number, operadorId: number, pdaId: number, estado: EstadoConteo
  ): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `DELETE FROM sod_conteo
       WHERE evento_id = ? AND ubicacion_id = ?
         AND operador_id = ? AND pda_id = ? AND estado = ?`,
      [eventoId, ubicacionId, operadorId, pdaId, estado]
    );
    if (isDevMode()) {
      console.log('[ConteoRepo] deleteSesion', { eventoId, ubicacionId, estado });
    }
  }

  private async fetchOne(
    eventoId: number, ubicacionId: number,
    productoId: number, operadorId: number, pdaId: number,
    estado: EstadoConteo = 'EN_CURSO'
  ): Promise<ConteoItem> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `${SELECT_ITEM}
       WHERE c.evento_id = ? AND c.ubicacion_id = ? AND c.producto_id = ?
         AND c.operador_id = ? AND c.pda_id = ? AND c.estado = ?`,
      [eventoId, ubicacionId, productoId, operadorId, pdaId, estado]
    );
    const row = result.values?.[0] as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error(`No se encontró el item de conteo para producto_id=${productoId}`);
    }
    return this.map(row);
  }

  private map(row: Record<string, unknown>): ConteoItem {
    return {
      id:             row['id']              as number,
      eventoId:       row['evento_id']       as number,
      ubicacionId:    row['ubicacion_id']    as number,
      productoId:     row['producto_id']     as number,
      sku:            row['sku']             as string,
      descripcion:    row['descripcion']     as string | null,
      cantidadFisica: row['cantidad_fisica'] as number,
      estado:         row['estado']          as EstadoConteo,
      fechaHora:      row['fecha_hora']      as string,
    };
  }

  private mapResumen(row: Record<string, unknown>): ConteoResumen {
    return {
      eventoId:       row['evento_id']       as number,
      ubicacionId:    row['ubicacion_id']    as number,
      operadorId:     row['operador_id']     as number,
      pdaId:          row['pda_id']          as number,
      estado:         row['estado']          as EstadoConteo,
      tag:            row['tag']             as string | null,
      // ubicacion_id es nullable en el schema: si falta el JOIN, mostrar '—' en vez de ocultar el conteo
      zonaCodigo:     (row['zona_codigo']    as string | null) ?? '—',
      zonaNombre:     row['zona_nombre']     as string | null,
      totalProductos: row['total_productos'] as number,
      totalUnidades:  row['total_unidades']  as number,
      fechaUltima:    row['fecha_ultima']    as string,
    };
  }
}
