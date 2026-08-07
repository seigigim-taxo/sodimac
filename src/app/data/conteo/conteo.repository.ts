import { Injectable, inject, isDevMode } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { Conteo, EstadoRonda } from '../../domain/conteo/models/conteo.model';
import { ConteoItem } from '../../domain/conteo/models/conteo-item.model';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
import { EstadoConteo } from '../../domain/conteo/models/estado-conteo.model';
import { BusquedaSkuResultado } from '../../domain/conteo/models/busqueda-sku.model';

/*
 * JOIN reutilizado: la línea trae su sku/descripción del producto y el número
 * de ronda de su conteo padre.
 */
const SELECT_ITEM = `
  SELECT d.id, d.conteo_id, d.ubicacion_id, d.producto_id,
         d.operador_id, d.pda_id, d.cantidad_fisica, d.estado, d.fecha_hora,
         c.iteracion,
         p.sku, p.descripcion
  FROM sod_conteo_detalle d
  JOIN sod_conteo   c ON c.id = d.conteo_id
  JOIN sod_producto p ON p.id = d.producto_id
`;

const SELECT_RONDA = `
  SELECT id, evento_id, iteracion, estado, fecha_apertura, fecha_cierre
  FROM sod_conteo
`;

/*
 * Los eventos de la MISMA jornada de inventario, a partir del id de cualquiera
 * de ellos. Toma un solo parámetro: el evento de referencia.
 *
 * Existe porque las rondas de un inventario no comparten evento —cada reconteo
 * crea el suyo— y no hay columna que las encadene. Lo que sí comparten es
 * tienda y fecha programada: el evento de reconteo hereda la fecha del anterior
 * justamente porque en terreno el reconteo ocurre el mismo día. Ese par es la
 * clave de la jornada, y es más ajustado que filtrar por tienda sola, que
 * mezclaría inventarios de otras fechas.
 */
const EVENTOS_DE_LA_JORNADA = `
  SELECT e.id
  FROM sod_evento_inventario e
  JOIN sod_evento_inventario ref ON ref.id = ?
  WHERE e.sucursal_id      = ref.sucursal_id
    AND e.fecha_programada = ref.fecha_programada
`;

@Injectable({ providedIn: 'root' })
export class SqliteConteoRepository implements ConteoRepository {
  private connection = inject(SqliteConnectionService);

  // ─────────────────────────── la ronda ───────────────────────────

  async abrirRonda(eventoId: number, iteracion: number): Promise<Conteo> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    /*
     * DO NOTHING y no DO UPDATE: si la ronda ya existe se devuelve como está.
     * Reabrirla pisaría su estado y podría revivir una ronda ya cerrada.
     */
    await db.run(
      `INSERT INTO sod_conteo (evento_id, iteracion)
       VALUES (?, ?)
       ON CONFLICT (evento_id, iteracion) DO NOTHING`,
      [eventoId, iteracion]
    );

    const result = await db.query(
      `${SELECT_RONDA} WHERE evento_id = ? AND iteracion = ?`,
      [eventoId, iteracion]
    );
    const row = result.values?.[0] as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error(`No se pudo abrir la ronda ${iteracion} del evento ${eventoId}`);
    }
    if (isDevMode()) console.log('[ConteoRepo] abrirRonda', { eventoId, iteracion });
    return this.mapRonda(row);
  }

  async getRondaAbierta(eventoId: number): Promise<Conteo | null> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `${SELECT_RONDA} WHERE evento_id = ? AND estado = 'ABIERTO'
       ORDER BY iteracion DESC LIMIT 1`,
      [eventoId]
    );
    const row = result.values?.[0] as Record<string, unknown> | undefined;
    return row ? this.mapRonda(row) : null;
  }

  async getUltimaRonda(eventoId: number): Promise<Conteo | null> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `${SELECT_RONDA} WHERE evento_id = ? ORDER BY iteracion DESC LIMIT 1`,
      [eventoId]
    );
    const row = result.values?.[0] as Record<string, unknown> | undefined;
    return row ? this.mapRonda(row) : null;
  }

  async cerrarRonda(conteoId: number): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `UPDATE sod_conteo
       SET estado = 'FINALIZADO', fecha_cierre = CURRENT_TIMESTAMP
       WHERE id = ? AND estado = 'ABIERTO'`,
      [conteoId]
    );
    if (isDevMode()) console.log('[ConteoRepo] cerrarRonda', { conteoId });
  }

  // ────────────────────────── las líneas ──────────────────────────

  /*
   * La atomicidad del par SELECT → INSERT/UPDATE la garantiza el ConteoFacade,
   * que serializa todas las escrituras en una cola.
   */
  async upsert(
    conteoId: number, ubicacionId: number,
    productoId: number, operadorId: number, pdaId: number,
    cantidad: number
  ): Promise<ConteoItem> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    const existing = await db.query(
      `SELECT id FROM sod_conteo_detalle
       WHERE conteo_id = ? AND ubicacion_id = ? AND producto_id = ?
         AND operador_id = ? AND pda_id = ? AND estado = 'EN_CURSO'`,
      [conteoId, ubicacionId, productoId, operadorId, pdaId]
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
          ? `UPDATE sod_conteo_detalle
             SET cantidad_fisica = 0, fecha_hora = CURRENT_TIMESTAMP
             WHERE id = ?`
          : `UPDATE sod_conteo_detalle
             SET cantidad_fisica = cantidad_fisica + ?, fecha_hora = CURRENT_TIMESTAMP
             WHERE id = ?`,
        cantidad === 0 ? [id] : [cantidad, id]
      );
    } else {
      /*
       * La iteración ya no se calcula: la línea cuelga del conteo, y el conteo
       * sabe a qué ronda pertenece. estado toma el DEFAULT 'EN_CURSO'.
       */
      await db.run(
        `INSERT INTO sod_conteo_detalle
           (conteo_id, ubicacion_id, producto_id, operador_id, pda_id, cantidad_fisica)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [conteoId, ubicacionId, productoId, operadorId, pdaId, cantidad]
      );
    }

    return this.fetchOne(conteoId, ubicacionId, productoId, operadorId, pdaId);
  }

  async adjust(
    conteoId: number, ubicacionId: number,
    productoId: number, operadorId: number, pdaId: number,
    delta: number, estado: EstadoConteo
  ): Promise<ConteoItem> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    // MAX(0, ...) impide cantidades negativas, pero sí permite llegar a 0:
    // dejar un SKU en cero es un dato válido (no hay unidades) y es distinto de
    // borrarlo del conteo, que sigue siendo delete(). La confirmación de que el
    // cero es intencional la pide la UI antes de llamar acá.
    await db.run(
      `UPDATE sod_conteo_detalle
       SET cantidad_fisica = MAX(0, cantidad_fisica + ?), fecha_hora = CURRENT_TIMESTAMP
       WHERE conteo_id = ? AND ubicacion_id = ? AND producto_id = ?
         AND operador_id = ? AND pda_id = ? AND estado = ?`,
      [delta, conteoId, ubicacionId, productoId, operadorId, pdaId, estado]
    );

    return this.fetchOne(conteoId, ubicacionId, productoId, operadorId, pdaId, estado);
  }

  async delete(
    conteoId: number, ubicacionId: number,
    productoId: number, operadorId: number, pdaId: number,
    estado: EstadoConteo
  ): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `DELETE FROM sod_conteo_detalle
       WHERE conteo_id = ? AND ubicacion_id = ? AND producto_id = ?
         AND operador_id = ? AND pda_id = ? AND estado = ?`,
      [conteoId, ubicacionId, productoId, operadorId, pdaId, estado]
    );
    if (isDevMode()) {
      console.log('[ConteoRepo] DELETE item', { conteoId, ubicacionId, productoId, estado });
    }
  }

  async getBySesion(
    conteoId: number, ubicacionId: number,
    operadorId: number, pdaId: number,
    estado: EstadoConteo
  ): Promise<ConteoItem[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `${SELECT_ITEM}
       WHERE d.conteo_id = ? AND d.ubicacion_id = ?
         AND d.operador_id = ? AND d.pda_id = ? AND d.estado = ?
       ORDER BY d.fecha_hora DESC`,
      [conteoId, ubicacionId, operadorId, pdaId, estado]
    );
    const items = (result.values ?? []).map((r) => this.map(r as Record<string, unknown>));
    if (isDevMode()) {
      console.log('[ConteoRepo] getBySesion', { conteoId, ubicacionId, estado });
      console.table(items);
    }
    return items;
  }

  async cerrarTag(conteoId: number, ubicacionId: number, operadorId: number): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `UPDATE sod_conteo_detalle
       SET estado = 'FINALIZADO'
       WHERE conteo_id = ? AND ubicacion_id = ? AND operador_id = ?
         AND estado = 'EN_CURSO'`,
      [conteoId, ubicacionId, operadorId]
    );
    if (isDevMode()) console.log('[ConteoRepo] cerrarTag', { conteoId, ubicacionId, operadorId });
  }

  async marcarSincronizado(
    conteoId: number, ubicacionId: number, operadorId: number, pdaId: number
  ): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `UPDATE sod_conteo_detalle
       SET estado = 'SINCRONIZADO'
       WHERE conteo_id = ? AND ubicacion_id = ?
         AND operador_id = ? AND pda_id = ? AND estado = 'FINALIZADO'`,
      [conteoId, ubicacionId, operadorId, pdaId]
    );
    if (isDevMode()) console.log('[ConteoRepo] marcarSincronizado', { conteoId, ubicacionId });
  }

  async deleteSesion(
    conteoId: number, ubicacionId: number, operadorId: number, pdaId: number, estado: EstadoConteo
  ): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `DELETE FROM sod_conteo_detalle
       WHERE conteo_id = ? AND ubicacion_id = ?
         AND operador_id = ? AND pda_id = ? AND estado = ?`,
      [conteoId, ubicacionId, operadorId, pdaId, estado]
    );
    if (isDevMode()) {
      console.log('[ConteoRepo] deleteSesion', { conteoId, ubicacionId, estado });
    }
  }

  async getResumenes(operadorId: number, pdaId: number): Promise<ConteoResumen[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT d.conteo_id, c.evento_id, c.iteracion,
              d.ubicacion_id, d.operador_id, d.pda_id, d.estado,
              u.tag, z.nombre AS zona_codigo, z.descripcion AS zona_nombre,
              COUNT(*)               AS total_productos,
              SUM(d.cantidad_fisica) AS total_unidades,
              MAX(d.fecha_hora)      AS fecha_ultima
       FROM sod_conteo_detalle d
       JOIN sod_conteo c         ON c.id = d.conteo_id
       LEFT JOIN sod_ubicacion u ON u.id = d.ubicacion_id
       LEFT JOIN sod_zona z      ON z.id = u.zona_id
       WHERE d.operador_id = ? AND d.pda_id = ?
       GROUP BY d.conteo_id, d.ubicacion_id, d.estado
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

  // ─────────── consultas por evento (cruzan todas las rondas) ───────────

  async getSkusContadosPorEvento(eventoId: number, operadorId: number, pdaId: number): Promise<string[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT DISTINCT p.sku
       FROM sod_conteo_detalle d
       JOIN sod_conteo   c ON c.id = d.conteo_id
       JOIN sod_producto p ON p.id = d.producto_id
       WHERE c.evento_id = ? AND d.operador_id = ? AND d.pda_id = ?
         AND d.estado IN ('EN_CURSO', 'FINALIZADO')`,
      [eventoId, operadorId, pdaId]
    );
    return (result.values ?? []).map((r) => (r as Record<string, unknown>)['sku'] as string);
  }

  async getUnidadesContadasPorEvento(eventoId: number, operadorId: number, pdaId: number): Promise<number> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT COALESCE(SUM(d.cantidad_fisica), 0) AS total
       FROM sod_conteo_detalle d
       JOIN sod_conteo c ON c.id = d.conteo_id
       WHERE c.evento_id = ? AND d.operador_id = ? AND d.pda_id = ?
         AND d.estado IN ('EN_CURSO', 'FINALIZADO')`,
      [eventoId, operadorId, pdaId]
    );
    const row = result.values?.[0] as Record<string, unknown> | undefined;
    return (row?.['total'] as number) ?? 0;
  }

  /*
   * Se agrupa por ronda + ubicación y se suman las cantidades: un mismo TAG puede
   * tener varias líneas del mismo SKU (una por operador/PDA), y devolverlas
   * sueltas haría que el operador leyera "TAG 12 · 3 unidades" dos veces en vez
   * de las 6 que hay contadas ahí.
   */
  async buscarPorSku(eventoId: number, sku: string): Promise<BusquedaSkuResultado[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT c.iteracion                     AS iteracion,
              u.tag                           AS tag,
              z.nombre                        AS zona_codigo,
              z.descripcion                   AS zona_nombre,
              SUM(d.cantidad_fisica)          AS cantidad
       FROM sod_conteo_detalle d
       JOIN sod_conteo   c       ON c.id = d.conteo_id
       JOIN sod_producto p       ON p.id = d.producto_id
       LEFT JOIN sod_ubicacion u ON u.id = d.ubicacion_id
       LEFT JOIN sod_zona z      ON z.id = u.zona_id
       WHERE c.evento_id IN (${EVENTOS_DE_LA_JORNADA})
         AND p.sku = ?
         AND d.estado IN ('EN_CURSO', 'FINALIZADO', 'SINCRONIZADO')
       GROUP BY c.iteracion, d.ubicacion_id
       ORDER BY c.iteracion DESC, u.tag`,
      [eventoId, sku]
    );
    return (result.values ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        iteracion: row['iteracion'] as number,
        tag: row['tag'] as string | null,
        zonaCodigo: (row['zona_codigo'] as string | null) ?? '—',
        zonaNombre: row['zona_nombre'] as string | null,
        cantidad: row['cantidad'] as number,
      };
    });
  }

  async getTagsContadosEnRondasAnteriores(eventoId: number, iteracion: number): Promise<string[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT DISTINCT u.tag
       FROM sod_conteo_detalle d
       JOIN sod_conteo c         ON c.id = d.conteo_id
       LEFT JOIN sod_ubicacion u ON u.id = d.ubicacion_id
       /*
        * Por jornada y no por evento: cada ronda de reconteo crea su propio
        * evento, así que filtrar por c.evento_id dejaría fuera justamente las
        * rondas anteriores, que es lo único que esta consulta busca. Los TAGs
        * siguen en base colgando de su conteo; lo que había que soltar era el
        * supuesto de que todas las rondas comparten evento.
        */
       WHERE c.evento_id IN (${EVENTOS_DE_LA_JORNADA})
         AND c.iteracion < ?
         AND u.tag IS NOT NULL
         AND u.tag != ''
       ORDER BY u.tag`,
      [eventoId, iteracion]
    );
    return (result.values ?? [])
      .map((r) => (r as Record<string, unknown>)['tag'] as string)
      .filter((t): t is string => !!t);
  }

  // ─────────────────────────── mapeo ───────────────────────────

  private async fetchOne(
    conteoId: number, ubicacionId: number,
    productoId: number, operadorId: number, pdaId: number,
    estado: EstadoConteo = 'EN_CURSO'
  ): Promise<ConteoItem> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `${SELECT_ITEM}
       WHERE d.conteo_id = ? AND d.ubicacion_id = ? AND d.producto_id = ?
         AND d.operador_id = ? AND d.pda_id = ? AND d.estado = ?`,
      [conteoId, ubicacionId, productoId, operadorId, pdaId, estado]
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
      conteoId: row['conteo_id'] as number,
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

  private mapRonda(row: Record<string, unknown>): Conteo {
    return {
      id: row['id'] as number,
      eventoId: row['evento_id'] as number,
      iteracion: row['iteracion'] as number,
      estado: row['estado'] as EstadoRonda,
      fechaApertura: row['fecha_apertura'] as string,
      fechaCierre: row['fecha_cierre'] as string | null,
    };
  }

  private mapResumen(row: Record<string, unknown>): ConteoResumen {
    return {
      conteoId: row['conteo_id'] as number,
      eventoId: row['evento_id'] as number,
      ubicacionId: row['ubicacion_id'] as number,
      operadorId: row['operador_id'] as number,
      pdaId: row['pda_id'] as number,
      estado: row['estado'] as EstadoConteo,
      tag: row['tag'] as string | null,
      // ubicacion_id puede no resolver la zona: mostrar '—' en vez de ocultar el conteo
      zonaCodigo: (row['zona_codigo'] as string | null) ?? '—',
      zonaNombre: row['zona_nombre'] as string | null,
      totalProductos: row['total_productos'] as number,
      totalUnidades: row['total_unidades'] as number,
      iteracion: row['iteracion'] as number,
      fechaUltima: row['fecha_ultima'] as string,
    };
  }
}
