import { Injectable, inject, isDevMode } from '@angular/core';
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoItem } from '../../domain/conteo/models/conteo-item.model';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
import { EstadoConteo } from '../../domain/conteo/models/estado-conteo.model';
import { BusquedaSkuResultado } from '../../domain/conteo/models/busqueda-sku.model';

// JOIN reutilizado en fetchOne y getBySesion
const SELECT_ITEM = `
  SELECT c.id, c.evento_id, c.ubicacion_id, c.producto_id,
         c.operador_id, c.pda_id, c.cantidad_fisica, c.estado, c.iteracion, c.fecha_hora,
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
      //
      // Cero es la excepción: no es "sumar nada" (un no-op silencioso), es la
      // declaración de que del SKU no hay unidades — típicamente corrigiendo un
      // conteo previo del mismo SKU. Por eso reemplaza el valor en vez de sumarse.
      const id = (existing.values[0] as Record<string, unknown>)['id'] as number;
      await db.run(
        cantidad === 0
          ? `UPDATE sod_conteo
             SET cantidad_fisica = 0,
                 fecha_hora      = CURRENT_TIMESTAMP
             WHERE id = ?`
          : `UPDATE sod_conteo
             SET cantidad_fisica = cantidad_fisica + ?,
                 fecha_hora      = CURRENT_TIMESTAMP
             WHERE id = ?`,
        cantidad === 0 ? [id] : [cantidad, id]
      );
    } else {
      /*
       * estado toma el DEFAULT 'EN_CURSO' del schema. La iteración se deriva del
       * propio conteo: la ronda es el mayor número ya registrado en el evento, o 1
       * si es la primera fila.
       *
       * LIMITACIÓN CONOCIDA: una ronda recién abierta todavía no tiene filas
       * propias, así que MAX() sigue devolviendo la anterior. Mientras la ronda
       * activa no se guarde en ninguna parte, no hay forma de distinguir "la ronda
       * N está cerrada" de "la ronda N+1 está abierta y vacía".
       */
      await db.run(
        `INSERT INTO sod_conteo
           (evento_id, ubicacion_id, producto_id, operador_id, pda_id, cantidad_fisica, iteracion)
         VALUES (?, ?, ?, ?, ?, ?,
                 COALESCE((SELECT MAX(iteracion) FROM sod_conteo WHERE evento_id = ?), 1))`,
        [eventoId, ubicacionId, productoId, operadorId, pdaId, cantidad, eventoId]
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
    await this.assertIteracionActiva(db, eventoId, ubicacionId, productoId, operadorId, pdaId, estado);

    // MAX(0, ...) impide cantidades negativas, pero sí permite llegar a 0:
    // dejar un SKU en cero es un dato válido (no hay unidades) y es distinto de
    // borrarlo del conteo, que sigue siendo delete(). La confirmación de que el
    // cero es intencional la pide la UI antes de llamar acá.
    await db.run(
      `UPDATE sod_conteo
       SET cantidad_fisica = MAX(0, cantidad_fisica + ?),
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
    await this.assertIteracionActiva(db, eventoId, ubicacionId, productoId, operadorId, pdaId, estado);

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
              MAX(c.iteracion)       AS iteracion,
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

  async getSkusContadosPorEvento(eventoId: number, operadorId: number, pdaId: number): Promise<string[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT DISTINCT p.sku
       FROM sod_conteo c
       JOIN sod_producto p ON p.id = c.producto_id
       WHERE c.evento_id = ? AND c.operador_id = ? AND c.pda_id = ?
         AND c.estado IN ('EN_CURSO', 'FINALIZADO')`,
      [eventoId, operadorId, pdaId]
    );
    return (result.values ?? []).map((r) => (r as Record<string, unknown>)['sku'] as string);
  }

  async deleteSesion(
    eventoId: number, ubicacionId: number, operadorId: number, pdaId: number, estado: EstadoConteo
  ): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await this.assertIteracionActivaSesion(db, eventoId, ubicacionId, operadorId, pdaId, estado);

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

  async buscarPorSku(eventoId: number, sku: string): Promise<BusquedaSkuResultado[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT u.tag, z.codigo AS zona_codigo, z.nombre AS zona_nombre, c.cantidad_fisica
       FROM sod_conteo c
       JOIN sod_producto p       ON p.id = c.producto_id
       LEFT JOIN sod_ubicacion u ON u.id = c.ubicacion_id
       LEFT JOIN sod_zona z      ON z.id = u.zona_id
       WHERE c.evento_id = ? AND p.sku = ?
         AND c.estado IN ('EN_CURSO', 'FINALIZADO', 'SINCRONIZADO')
       ORDER BY c.fecha_hora DESC`,
      [eventoId, sku]
    );
    return (result.values ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        tag: row['tag'] as string | null,
        zonaCodigo: (row['zona_codigo'] as string | null) ?? '—',
        zonaNombre: row['zona_nombre'] as string | null,
        cantidad: row['cantidad_fisica'] as number,
      };
    });
  }

  /*
   * Una iteración se cierra en forma definitiva al abrirse la siguiente: sus filas
   * dejan de ser editables aunque queden en estado FINALIZADO (no sincronizado).
   * Ambos helpers comparan contra MAX(sod_conteo.iteracion) del evento — la ronda
   * más avanzada registrada — y cortan la escritura ANTES del UPDATE/DELETE,
   * con un error explícito en vez de un no-op silencioso (mismo criterio que
   * evitó el bug de "Ir a contar").
   */
  private async assertIteracionActiva(
    db: SQLiteDBConnection, eventoId: number, ubicacionId: number,
    productoId: number, operadorId: number, pdaId: number, estado: EstadoConteo
  ): Promise<void> {
    const result = await db.query(
      `SELECT c.iteracion, (SELECT MAX(iteracion) FROM sod_conteo WHERE evento_id = ?) AS activa
       FROM sod_conteo c
       WHERE c.evento_id = ? AND c.ubicacion_id = ? AND c.producto_id = ?
         AND c.operador_id = ? AND c.pda_id = ? AND c.estado = ?`,
      [eventoId, eventoId, ubicacionId, productoId, operadorId, pdaId, estado]
    );
    const row = result.values?.[0] as Record<string, unknown> | undefined;
    if (row && row['iteracion'] !== row['activa']) {
      throw new Error('No se puede modificar un conteo de una iteración ya cerrada');
    }
  }

  private async assertIteracionActivaSesion(
    db: SQLiteDBConnection, eventoId: number, ubicacionId: number,
    operadorId: number, pdaId: number, estado: EstadoConteo
  ): Promise<void> {
    const result = await db.query(
      `SELECT MIN(c.iteracion) AS iteracion, (SELECT MAX(iteracion) FROM sod_conteo WHERE evento_id = ?) AS activa
       FROM sod_conteo c
       WHERE c.evento_id = ? AND c.ubicacion_id = ?
         AND c.operador_id = ? AND c.pda_id = ? AND c.estado = ?`,
      [eventoId, eventoId, ubicacionId, operadorId, pdaId, estado]
    );
    const row = result.values?.[0] as Record<string, unknown> | undefined;
    if (row && row['iteracion'] !== null && row['iteracion'] !== row['activa']) {
      throw new Error('No se puede modificar un conteo de una iteración ya cerrada');
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
      id: row['id'] as number,
      eventoId: row['evento_id'] as number,
      ubicacionId: row['ubicacion_id'] as number,
      productoId: row['producto_id'] as number,
      sku: row['sku'] as string,
      descripcion: row['descripcion'] as string | null,
      cantidadFisica: row['cantidad_fisica'] as number,
      estado: row['estado'] as EstadoConteo,
      iteracion: row['iteracion'] as number,
      fechaHora: row['fecha_hora'] as string,
    };
  }

  private mapResumen(row: Record<string, unknown>): ConteoResumen {
    return {
      eventoId: row['evento_id'] as number,
      ubicacionId: row['ubicacion_id'] as number,
      operadorId: row['operador_id'] as number,
      pdaId: row['pda_id'] as number,
      estado: row['estado'] as EstadoConteo,
      tag: row['tag'] as string | null,
      // ubicacion_id es nullable en el schema: si falta el JOIN, mostrar '—' en vez de ocultar el conteo
      zonaCodigo: (row['zona_codigo'] as string | null) ?? '—',
      zonaNombre: row['zona_nombre'] as string | null,
      totalProductos: row['total_productos'] as number,
      totalUnidades: row['total_unidades'] as number,
      iteracion: row['iteracion'] as number,
      fechaUltima: row['fecha_ultima'] as string,
    };
  }

  async getIteracionActiva(eventoId: number): Promise<number> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT COALESCE(MAX(iteracion), 1) AS iteracion FROM sod_conteo WHERE evento_id = ?`,
      [eventoId]
    );
    const row = result.values?.[0] as Record<string, unknown> | undefined;
    return (row?.['iteracion'] as number) ?? 1;
  }

  async getUnidadesContadasPorEvento(eventoId: number, operadorId: number, pdaId: number): Promise<number> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT COALESCE(SUM(c.cantidad_fisica), 0) AS total
     FROM sod_conteo c
     WHERE c.evento_id = ? AND c.operador_id = ? AND c.pda_id = ?
       AND c.estado IN ('EN_CURSO', 'FINALIZADO')`,
      [eventoId, operadorId, pdaId]
    );
    const row = result.values?.[0] as Record<string, unknown> | undefined;
    return (row?.['total'] as number) ?? 0;
  }

  async getTagsContadosEnIteracionesAnteriores(eventoId: number, iteracionActual: number): Promise<string[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT DISTINCT u.tag
       FROM sod_conteo c
       LEFT JOIN sod_ubicacion u ON u.id = c.ubicacion_id
       WHERE c.evento_id = ?
         AND c.iteracion < ?
         AND u.tag IS NOT NULL
         AND u.tag != ''
       ORDER BY u.tag`,
      [eventoId, iteracionActual]
    );
    return (result.values ?? [])
      .map((r) => (r as Record<string, unknown>)['tag'] as string)
      .filter((t): t is string => !!t);
  }
}