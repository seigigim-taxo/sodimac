import { Injectable, inject, isDevMode } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { Conteo, EstadoRonda } from '../../domain/conteo/models/conteo.model';
import { ConteoItem } from '../../domain/conteo/models/conteo-item.model';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
import { SesionTrabajoEnCurso } from '../../domain/conteo/models/sesion-trabajo.model';
import { ConteoTrazabilidadItem } from '../../domain/conteo/models/conteo-trazabilidad-item.model';
import { EstadoConteo } from '../../domain/conteo/models/estado-conteo.model';
import { BusquedaSkuResultado } from '../../domain/conteo/models/busqueda-sku.model';
import { TagFinalizadoPayload, TagFinalizadoLecturaPayload, detalleUid } from '../../domain/sincronizacion/models/tag-finalizado.model';
import { MedioCaptura } from '../../domain/conteo/models/medio-captura.model';
import { ConteoLectura } from '../../domain/conteo/models/conteo-lectura.model';
import { ahoraSql, ahoraSqlMs, selloUid } from '../../shared/utils/fecha.utils';

/*
 * Mapeo de aliases antiguos de zona a los códigos oficiales de
 * sod_cfg_tipo_ubicacion. Evita que APKs con datos legacy envíen
 * códigos inexistentes al SP.
 */
const ZONA_ALIAS: Record<string, string> = {
  BODEGA_TRASTIENDA: 'BODEGA',
  EXHIBICIONES:      'EXHIBICION',
  PTO_VTA_OTROS:     'OTRO',
};

const ZONA_OFICIALES = new Set([
  'PUNTO_VENTA', 'ALTILLO', 'SALA_VENTAS', 'BODEGA',
  'RECEPCION', 'TRASTIENDA', 'EXHIBICION', 'GANCHERA', 'OTRO',
]);

function normalizarZonaNombre(nombre: string): string {
  const upper = nombre.trim().toUpperCase();
  const normalizado = ZONA_ALIAS[upper] ?? upper;
  if (!ZONA_OFICIALES.has(normalizado)) {
    throw new Error(`Tipo de ubicación no válido para SGO: ${nombre}`);
  }
  return normalizado;
}

/*
 * JOIN reutilizado: la línea trae su sku/descripción del producto y el número
 * de ronda de su conteo padre.
 */
const SELECT_ITEM = `
  SELECT d.id, d.conteo_id, d.ubicacion_id, d.producto_id,
         d.operador_id, d.pda_id, d.cantidad_fisica, d.estado, d.fecha_hora,
         d.codigo_lectura,
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
      // fecha_apertura va explícita: el DEFAULT de la tabla la escribiría en UTC.
      `INSERT INTO sod_conteo (evento_id, iteracion, fecha_apertura)
       VALUES (?, ?, ?)
       ON CONFLICT (evento_id, iteracion) DO NOTHING`,
      [eventoId, iteracion, ahoraSql()]
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
       SET estado = 'FINALIZADO', fecha_cierre = ?
       WHERE id = ? AND estado = 'ABIERTO'`,
      [ahoraSql(), conteoId]
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
    cantidad: number, codigoLectura: string, medioCaptura: MedioCaptura
  ): Promise<ConteoItem> {
    /*
     * El total y la lectura van juntos o no van: si la cantidad se sumara y el
     * registro de la captura fallara, el reporte diría que ese código no se usó
     * nunca. Es la única parte del conteo donde dos escrituras describen el
     * mismo hecho.
     */
    return this.connection.enTransaccion(SODIMAC_DB_NAME, async (db) => {

    /*
     * La búsqueda NO filtra por estado, a diferencia del resto de operaciones:
     * tiene que mirar exactamente la misma tupla que el UNIQUE de la tabla, que
     * tampoco incluye estado. Con el filtro por EN_CURSO, una línea ya cerrada
     * del mismo SKU no aparecía acá y se caía al INSERT, que reventaba contra
     * el UNIQUE con un error de SQLite en la cara del operador.
     */
    const existing = await db.query(
      `SELECT id, estado, cantidad_fisica FROM sod_conteo_detalle
       WHERE conteo_id = ? AND ubicacion_id = ? AND producto_id = ?
         AND operador_id = ? AND pda_id = ?`,
      [conteoId, ubicacionId, productoId, operadorId, pdaId]
    );

    const estadoExistente = (existing.values?.[0] as Record<string, unknown> | undefined)?.['estado'] as
      | EstadoConteo
      | undefined;

    /*
     * Una línea SINCRONIZADA ya viajó al SGO: editarla dejaría a la PDA
     * diciendo una cosa y al servidor otra. Es el mismo límite que respeta
     * ReabrirTagUseCase, y el único — volver a contar sobre un TAG finalizado
     * sí está permitido y se resuelve al abrir la sesión, no acá.
     */
    if (estadoExistente === 'SINCRONIZADO') {
      throw new Error('Este SKU ya se sincronizó con el servidor y no se puede volver a contar en este TAG.');
    }

    /*
     * El movimiento que este scan produce sobre el total. No es siempre
     * `cantidad`:
     *
     * Cero no es "sumar nada" (un no-op silencioso), es la declaración de que
     * del SKU no hay unidades — típicamente corrigiendo un conteo previo. Por
     * eso REEMPLAZA el total, y el movimiento que lo logra es el negativo de lo
     * que había.
     *
     * Calcularlo acá es lo que sostiene el invariante de sod_conteo_lectura:
     * la suma de los movimientos siempre da cantidad_fisica.
     */
    const filaPrevia = existing.values?.[0] as Record<string, unknown> | undefined;
    const totalPrevio = (filaPrevia?.['cantidad_fisica'] as number | undefined) ?? 0;
    const movimiento = cantidad === 0 ? -totalPrevio : cantidad;

    if (filaPrevia) {
      // Opción B: se actualiza codigo_lectura al último código escaneado exitoso.
      const id = filaPrevia['id'] as number;
      await db.run(
        `UPDATE sod_conteo_detalle
         SET cantidad_fisica = cantidad_fisica + ?, codigo_lectura = ?, fecha_hora = ?
         WHERE id = ?`,
        [movimiento, codigoLectura, ahoraSql(), id],
        false
      );
    } else {
      /*
       * La iteración ya no se calcula: la línea cuelga del conteo, y el conteo
       * sabe a qué ronda pertenece. estado toma el DEFAULT 'EN_CURSO'.
       *
       * fecha_hora sí va explícita: dejarla al DEFAULT la escribiría en UTC.
       */
      await db.run(
        `INSERT INTO sod_conteo_detalle
           (conteo_id, ubicacion_id, producto_id, operador_id, pda_id, cantidad_fisica, codigo_lectura, fecha_hora)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [conteoId, ubicacionId, productoId, operadorId, pdaId, cantidad, codigoLectura, ahoraSql()],
        false
      );
    }

    const item = await this.fetchOne(conteoId, ubicacionId, productoId, operadorId, pdaId);

    /*
     * Se registra siempre, incluso con movimiento 0: la fila deja constancia de
     * que ESE código se usó y de qué forma, y eso vale aunque no haya movido
     * unidades. El reporte responde "¿se escaneó?" por presencia del par
     * (código, medio), no por el signo de la suma.
     */
    await db.run(
      `INSERT INTO sod_conteo_lectura (detalle_id, codigo_lectura, medio_captura, cantidad, fecha_hora)
       VALUES (?, ?, ?, ?, ?)`,
      [item.id, codigoLectura, medioCaptura, movimiento, ahoraSqlMs()],
      false
    );

    return item;
    });
  }

  async getLecturas(detalleId: number): Promise<ConteoLectura[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT codigo_lectura, medio_captura, cantidad, fecha_hora
       FROM sod_conteo_lectura
       WHERE detalle_id = ?
       ORDER BY id`,
      [detalleId]
    );
    return (result.values ?? []).map((row: Record<string, unknown>) => ({
      codigoLectura: (row['codigo_lectura'] as string | null) ?? null,
      medioCaptura:  row['medio_captura']  as MedioCaptura,
      cantidad:      row['cantidad']       as number,
      fechaHora:     row['fecha_hora']     as string,
    }));
  }

  async adjust(
    conteoId: number, ubicacionId: number,
    productoId: number, operadorId: number, pdaId: number,
    delta: number, estado: EstadoConteo
  ): Promise<ConteoItem> {
    /*
     * Los botones +/- también son una captura: declaran unidades. Lo que NO
     * hacen es leer un código, y por eso la lectura queda con codigo_lectura
     * nulo. Atribuirle el código que ya tenía la línea diría que ese código se
     * tipeó a mano — y si venía de la pistola, el reporte concluiría que el EAN
     * no se escaneó. Es la afirmación falsa que todo esto existe para evitar.
     *
     * Se AGREGA un movimiento; no se tocan las lecturas anteriores. Bajar de 5
     * a 3 deja constancia de que hubo un escaneo de 5 y una baja manual de 2,
     * que es lo que realmente pasó.
     */
    return this.connection.enTransaccion(SODIMAC_DB_NAME, async (db) => {

    const detalleRow = await db.query(
      `SELECT id, cantidad_fisica
       FROM sod_conteo_detalle
       WHERE conteo_id = ? AND ubicacion_id = ? AND producto_id = ?
         AND operador_id = ? AND pda_id = ? AND estado = ?`,
      [conteoId, ubicacionId, productoId, operadorId, pdaId, estado]
    );
    const detalle = detalleRow.values?.[0] as Record<string, unknown> | undefined;
    if (!detalle) {
      throw new Error('No se encontró el detalle para ajustar');
    }

    const detalleId  = detalle['id'] as number;
    const totalPrevio = detalle['cantidad_fisica'] as number;

    /*
     * El movimiento REAL, no el pedido: MAX(0, …) impide dejar la línea en
     * negativo, así que pedir -5 sobre un total de 3 mueve -3. Registrar el
     * pedido en vez de lo aplicado rompería el invariante de la tabla.
     */
    const totalNuevo = Math.max(0, totalPrevio + delta);
    const movimiento = totalNuevo - totalPrevio;

    // Sin movimiento no hay nada que escribir ni que registrar.
    if (movimiento === 0) {
      return this.fetchOne(conteoId, ubicacionId, productoId, operadorId, pdaId, estado);
    }

    await db.run(
      `UPDATE sod_conteo_detalle
       SET cantidad_fisica = ?, fecha_hora = ?
       WHERE id = ?`,
      [totalNuevo, ahoraSql(), detalleId],
      false
    );

    await db.run(
      `INSERT INTO sod_conteo_lectura (detalle_id, codigo_lectura, medio_captura, cantidad, fecha_hora)
       VALUES (?, NULL, 'MANUAL', ?, ?)`,
      [detalleId, movimiento, ahoraSqlMs()],
      false
    );

    return this.fetchOne(conteoId, ubicacionId, productoId, operadorId, pdaId, estado);
    });
  }

  async delete(
    conteoId: number, ubicacionId: number,
    productoId: number, operadorId: number, pdaId: number,
    estado: EstadoConteo
  ): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    /*
     * Las lecturas primero: cuelgan del detalle por FK y borrarlo antes las
     * dejaría huérfanas. Se borran en vez de conservarse porque la línea deja
     * de existir — esto no es un historial de auditoría, es cómo se capturó lo
     * que hay contado ahora.
     */
    await db.run(
      `DELETE FROM sod_conteo_lectura
       WHERE detalle_id IN (
         SELECT id FROM sod_conteo_detalle
         WHERE conteo_id = ? AND ubicacion_id = ? AND producto_id = ?
           AND operador_id = ? AND pda_id = ? AND estado = ?
       )`,
      [conteoId, ubicacionId, productoId, operadorId, pdaId, estado]
    );
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

  /*
   * El filtro por estado hace la operación segura e idempotente: una línea ya
   * SINCRONIZADA no se toca —es inmutable— y reabrir dos veces no cambia nada.
   */
  async reabrirTag(
    conteoId: number, ubicacionId: number, operadorId: number, pdaId: number
  ): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `UPDATE sod_conteo_detalle
       SET estado = 'EN_CURSO'
       WHERE conteo_id = ? AND ubicacion_id = ?
         AND operador_id = ? AND pda_id = ? AND estado = 'FINALIZADO'`,
      [conteoId, ubicacionId, operadorId, pdaId]
    );
    if (isDevMode()) console.log('[ConteoRepo] reabrirTag', { conteoId, ubicacionId, operadorId, pdaId });
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
    // Las lecturas primero, por la FK — igual que en delete().
    await db.run(
      `DELETE FROM sod_conteo_lectura
       WHERE detalle_id IN (
         SELECT id FROM sod_conteo_detalle
         WHERE conteo_id = ? AND ubicacion_id = ?
           AND operador_id = ? AND pda_id = ? AND estado = ?
       )`,
      [conteoId, ubicacionId, operadorId, pdaId, estado]
    );
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

  /*
   * JOIN y no LEFT JOIN a propósito: una sesión que no puede resolver su zona ni
   * su ubicación no sirve para restaurar nada, y devolverla a medias dejaría a la
   * app creyendo que puede volver a un TAG que no sabe ubicar.
   */
  async getSesionEnCurso(operadorId: number, pdaId: number): Promise<SesionTrabajoEnCurso | null> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT c.evento_id, d.conteo_id, d.ubicacion_id,
              u.zona_id, u.tag, u.codigo AS ubicacion_precisa,
              MAX(d.fecha_hora) AS fecha_ultima
       FROM sod_conteo_detalle d
       JOIN sod_conteo    c ON c.id = d.conteo_id
       JOIN sod_ubicacion u ON u.id = d.ubicacion_id
       WHERE d.operador_id = ? AND d.pda_id = ? AND d.estado = 'EN_CURSO'
         AND u.tag IS NOT NULL
       GROUP BY d.conteo_id, d.ubicacion_id
       ORDER BY fecha_ultima DESC
       LIMIT 1`,
      [operadorId, pdaId]
    );
    const row = result.values?.[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    const sesion: SesionTrabajoEnCurso = {
      eventoId:         row['evento_id']        as number,
      conteoId:         row['conteo_id']        as number,
      ubicacionId:      row['ubicacion_id']     as number,
      zonaId:           row['zona_id']          as number,
      tag:              row['tag']              as string,
      ubicacionPrecisa: row['ubicacion_precisa'] as string,
    };
    if (isDevMode()) console.log('[ConteoRepo] getSesionEnCurso', sesion);
    return sesion;
  }

  /*
   * Sin filtro por estado a propósito: acá no se busca una sesión para seguir
   * contando sino el evento donde el operador estuvo trabajando. Un TAG
   * FINALIZADO o SINCRONIZADO responde esa pregunta igual de bien que uno
   * EN_CURSO. Quien decide si ese evento sirve es el caso de uso.
   */
  async getEventoIdUltimoTrabajo(operadorId: number, pdaId: number): Promise<number | null> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT c.evento_id
       FROM sod_conteo_detalle d
       JOIN sod_conteo c ON c.id = d.conteo_id
       WHERE d.operador_id = ? AND d.pda_id = ?
       ORDER BY d.fecha_hora DESC
       LIMIT 1`,
      [operadorId, pdaId]
    );
    const row = result.values?.[0] as Record<string, unknown> | undefined;
    return row ? (row['evento_id'] as number) : null;
  }

  // ─────────── consultas por evento (cruzan todas las rondas) ───────────

  async getSkusContadosPorEvento(eventoId: number, operadorId: number, pdaId: number): Promise<string[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT DISTINCT p.sku
       FROM sod_conteo_detalle d
       JOIN sod_conteo   c ON c.id = d.conteo_id
       JOIN sod_producto p ON p.id = d.producto_id
       WHERE c.evento_id = ? AND d.operador_id = ? AND d.pda_id = ?`,
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
       WHERE c.evento_id = ? AND d.operador_id = ? AND d.pda_id = ?`,
      [eventoId, operadorId, pdaId]
    );
    const row = result.values?.[0] as Record<string, unknown> | undefined;
    return (row?.['total'] as number) ?? 0;
  }

  /*
   * Coincidencia por PREFIJO, no exacta: el buscador consulta mientras el
   * operador escribe, y con `=` no habría resultado hasta teclear el último
   * dígito. Se usa `sku LIKE 'termino%'` y no `%termino%` a propósito — el
   * comodín al inicio impide usar el índice de sod_producto.sku, y en una
   * tienda con miles de productos eso se nota en cada tecla.
   *
   * El LIMIT acota la lista a lo que cabe en pantalla: un prefijo corto puede
   * traer cientos de filas y ninguna sirve para decidir dónde ir a contar.
   */
  async buscarPorSku(sku: string, eventoId?: number): Promise<BusquedaSkuResultado[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    /*
     * Sin evento la consulta abarca toda la base local, y por eso ordena
     * primero por evento descendente: lo más reciente es lo que el operador
     * está buscando, y el LIMIT no puede dejarlo fuera por culpa de conteos
     * viejos.
     */
    const filtroEvento = eventoId !== undefined ? 'AND c.evento_id = ?' : '';
    const params = eventoId !== undefined ? [sku, eventoId] : [sku];

    const result = await db.query(
      `SELECT p.sku, c.iteracion, u.tag, z.nombre AS zona_codigo, z.descripcion AS zona_nombre,
              d.cantidad_fisica, e.nombre AS evento_nombre
       FROM sod_conteo_detalle d
       JOIN sod_conteo   c       ON c.id = d.conteo_id
       JOIN sod_evento_inventario e ON e.id = c.evento_id
       JOIN sod_producto p       ON p.id = d.producto_id
       LEFT JOIN sod_ubicacion u ON u.id = d.ubicacion_id
       LEFT JOIN sod_zona z      ON z.id = u.zona_id
       WHERE p.sku LIKE '%' || ? || '%'
         AND d.estado IN ('EN_CURSO', 'FINALIZADO', 'SINCRONIZADO')
         ${filtroEvento}
       ORDER BY c.evento_id DESC, p.sku, c.iteracion DESC, d.fecha_hora DESC
       LIMIT 50`,
      params
    );
    return (result.values ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        eventoNombre: (row['evento_nombre'] as string | null) ?? '—',
        sku: row['sku'] as string,
        iteracion: row['iteracion'] as number,
        tag: row['tag'] as string | null,
        zonaCodigo: (row['zona_codigo'] as string | null) ?? '—',
        zonaNombre: row['zona_nombre'] as string | null,
        cantidad: row['cantidad_fisica'] as number,
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
       WHERE c.evento_id = ?
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

  // ─────────── trazabilidad (lectura pura) ───────────

  async getTrazabilidadEvento(
    eventoId: number, operadorId: number, pdaId: number
  ): Promise<ConteoTrazabilidadItem[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT c.iteracion, c.id AS conteo_id,
              u.tag, z.nombre AS zona_codigo, z.descripcion AS zona_nombre,
              p.sku, p.descripcion,
              md.stock_sistema, d.cantidad_fisica, d.estado, d.fecha_hora
       FROM sod_conteo_detalle d
       JOIN sod_conteo   c ON c.id = d.conteo_id
       JOIN sod_producto p ON p.id = d.producto_id
       LEFT JOIN sod_ubicacion u ON u.id = d.ubicacion_id
       LEFT JOIN sod_zona z      ON z.id = u.zona_id
       LEFT JOIN sod_muestra m
         ON m.evento_id = c.evento_id AND m.iteracion = c.iteracion
       LEFT JOIN sod_muestra_detalle md
         ON md.muestra_id = m.id AND md.producto_id = d.producto_id
       WHERE c.evento_id = ? AND d.operador_id = ? AND d.pda_id = ?
       ORDER BY c.iteracion DESC, u.tag ASC, p.sku ASC`,
      [eventoId, operadorId, pdaId]
    );
    const items = (result.values ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        iteracion:      row['iteracion']      as number,
        conteoId:       row['conteo_id']      as number,
        tag:            row['tag']            as string | null,
        zonaCodigo:     (row['zona_codigo']  as string | null) ?? '—',
        zonaNombre:     row['zona_nombre']    as string | null,
        sku:            row['sku']            as string,
        descripcion:    row['descripcion']    as string | null,
        stockSistema:   row['stock_sistema']  as number | null,
        cantidadFisica: row['cantidad_fisica'] as number,
        estado:         row['estado']         as EstadoConteo,
        fechaHora:      row['fecha_hora']     as string,
      };
    });
    if (isDevMode()) {
      console.log('[ConteoRepo] getTrazabilidadEvento', { eventoId });
      console.table(items);
    }
    return items;
  }

  // ─────────── sincronización TAG ───────────

  async asegurarCargaUid(
    conteoId: number, ubicacionId: number, operadorId: number, pdaId: number
  ): Promise<string> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    const existing = await db.query(
      `SELECT carga_uid FROM sod_conteo_detalle
       WHERE conteo_id = ? AND ubicacion_id = ?
         AND operador_id = ? AND pda_id = ?
         AND estado = 'FINALIZADO'
         AND carga_uid IS NOT NULL
       LIMIT 1`,
      [conteoId, ubicacionId, operadorId, pdaId]
    );
    const existingUid = (existing.values?.[0] as Record<string, unknown>)?.['carga_uid'] as string | undefined;
    if (existingUid) {
      return existingUid;
    }

    const rondaRow = await db.query(
      `SELECT c.iteracion, e.fecha_programada AS eventoFecha,
              s.codigo_tienda, u.tag AS tagCodigo,
              z.nombre AS zonaNombre, z.descripcion AS zonaDescripcion,
              pda.codigo AS pdaCodigo
       FROM sod_conteo c
       JOIN sod_evento_inventario e ON e.id = c.evento_id
       JOIN sod_sucursal s          ON s.id = e.sucursal_id
       JOIN sod_ubicacion u         ON u.id = ?
       JOIN sod_zona z              ON z.id = u.zona_id
       JOIN sod_pda pda             ON pda.id = ?
       WHERE c.id = ?`,
      [ubicacionId, pdaId, conteoId]
    );
    const r = rondaRow.values?.[0] as Record<string, unknown> | undefined;
    if (!r) {
      throw new Error(`No se pudo generar carga_uid para conteo=${conteoId}`);
    }

    // Mismo sello que usan los detalles: si cada uno armara el suyo a mano, los
    // dos formatos se separarían con el tiempo dentro del mismo identificador.
    const ts = selloUid(ahoraSqlMs());

    const iteracion = r['iteracion'] as number;
    const fechaProg = (r['eventoFecha'] as string ?? '').replace(/-/g, '');
    const codigoTienda = r['codigo_tienda'] as string;
    const tagCodigo = (r['tagCodigo'] as string ?? '').replace(/\s+/g, '_');
    const zonaNombre = (r['zonaNombre'] as string ?? '').replace(/\s+/g, '_');
    const pdaCodigo = r['pdaCodigo'] as string;

    const cargaUid = `${codigoTienda}-${fechaProg}-ITER${iteracion}-${tagCodigo}-${zonaNombre}-${pdaCodigo}-${ts}`;

    await db.run(
      `UPDATE sod_conteo_detalle
       SET carga_uid = ?
       WHERE conteo_id = ? AND ubicacion_id = ?
         AND operador_id = ? AND pda_id = ?
         AND estado = 'FINALIZADO'`,
      [cargaUid, conteoId, ubicacionId, operadorId, pdaId]
    );

    if (isDevMode()) console.log('[ConteoRepo] asegurarCargaUid', { cargaUid });
    return cargaUid;
  }

  async getPayloadSincronizacion(conteo: ConteoResumen): Promise<TagFinalizadoPayload> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    const cargaUid = await this.asegurarCargaUid(
      conteo.conteoId, conteo.ubicacionId, conteo.operadorId, conteo.pdaId
    );

    const metaRow = await db.query(
      `SELECT s.codigo_tienda, e.fecha_programada,
              z.nombre AS zona_nombre, z.descripcion AS zona_descripcion,
              op.rut AS operador_rut, op.correo AS operador_login,
              pda.codigo AS pda_codigo,
              u.codigo AS ubicacion_codigo, u.tag AS tag_codigo,
              m.codigo_muestra, m.id_agenda, m.numero_agenda
       FROM sod_sucursal s
       JOIN sod_evento_inventario e ON e.id = ?
       JOIN sod_zona z              ON z.id = (
         SELECT u.zona_id FROM sod_ubicacion u WHERE u.id = ?
       )
       JOIN sod_user op             ON op.id = ?
       JOIN sod_pda pda             ON pda.id = ?
       JOIN sod_ubicacion u         ON u.id = ?
       LEFT JOIN sod_muestra m      ON m.evento_id = e.id AND m.iteracion = ?
       WHERE s.id = e.sucursal_id`,
      [conteo.eventoId, conteo.ubicacionId, conteo.operadorId, conteo.pdaId,
       conteo.ubicacionId, conteo.iteracion]
    );
    const meta = metaRow.values?.[0] as Record<string, unknown> | undefined;
    if (!meta) {
      throw new Error(`No se pudo armar payload para conteo=${conteo.conteoId}`);
    }

    const detallesRow = await db.query(
      `SELECT d.id AS detalle_id,
              p.sku, p.codigo_barras, p.descripcion,
              COALESCE(d.codigo_lectura, (
                SELECT MIN(pd.codigo_lectura)
                FROM sod_producto_detalle pd
                WHERE pd.producto_id = d.producto_id
              )) AS codigo_lectura,
              md.stock_sistema, d.cantidad_fisica, d.fecha_hora
       FROM sod_conteo_detalle d
       JOIN sod_conteo   c ON c.id = d.conteo_id
       JOIN sod_producto p ON p.id = d.producto_id
       LEFT JOIN sod_muestra m
         ON m.evento_id = c.evento_id AND m.iteracion = c.iteracion
       LEFT JOIN sod_muestra_detalle md
         ON md.muestra_id = m.id AND md.producto_id = d.producto_id
       WHERE d.conteo_id = ? AND d.ubicacion_id = ?
         AND d.operador_id = ? AND d.pda_id = ?
         AND d.estado = 'FINALIZADO'`,
      [conteo.conteoId, conteo.ubicacionId, conteo.operadorId, conteo.pdaId]
    );

    /*
     * Las lecturas se traen de una sola consulta para todo el TAG y se agrupan
     * en memoria: una por detalle serían N consultas contra SQLite en un equipo
     * lento, y un TAG puede tener cientos de SKU.
     */
    const lecturasRow = await db.query(
      /*
       * Acá se aplica el contrato del SGO: una entrada por combinación de
       * código y medio, con las unidades sumadas. La tabla local guarda una
       * fila por captura; el agrupado vive en esta consulta y no en el modelo,
       * para que cambiar el contrato no cueste otra migración.
       *
       * La suma da cantidad_fisica, sin excepciones: todo movimiento genera
       * lectura, incluidos los botones +/- y la declaración de cantidad 0.
       *
       * Los ajustes con +/- tienen codigo_lectura nulo y SQLite agrupa los
       * nulos entre sí, así que quedan como una sola entrada por detalle con el
       * neto de lo movido a mano.
       *
       * Una entrada puede venir con cantidad negativa o cero — un código
       * escaneado y después retractado. No se filtra: la presencia del par
       * (código, medio) es lo que dice cómo entró ese código, y eso vale aunque
       * el neto sea cero.
       *
       * Se ordena por la primera aparición, que es el orden real en que el
       * operador usó cada código.
       */
      `SELECT l.detalle_id, l.codigo_lectura, l.medio_captura,
              SUM(l.cantidad) AS cantidad
       FROM sod_conteo_lectura l
       JOIN sod_conteo_detalle d ON d.id = l.detalle_id
       WHERE d.conteo_id = ? AND d.ubicacion_id = ?
         AND d.operador_id = ? AND d.pda_id = ?
         AND d.estado = 'FINALIZADO'
       GROUP BY l.detalle_id, l.codigo_lectura, l.medio_captura
       ORDER BY MIN(l.id)`,
      [conteo.conteoId, conteo.ubicacionId, conteo.operadorId, conteo.pdaId]
    );

    /*
     * El instante en que cada producto entró al TAG: la PRIMERA lectura de la
     * línea, que es la de menor id porque la tabla solo se agrega.
     *
     * Tiene que ser la primera y no la última: el detalle_uid se arma con esto,
     * y un identificador que cambia entre un envío fallido y su reintento haría
     * que el SGO —que deduplica por detalle_uid— insertara el producto dos
     * veces en vez de reconocerlo.
     *
     * Se va por MIN(id) y no por MIN(fecha_hora): el id es el orden real de
     * captura, la fecha es solo lo que decía el reloj.
     */
    const primeraLecturaRow = await db.query(
      `SELECT l.detalle_id, l.fecha_hora
       FROM sod_conteo_lectura l
       JOIN sod_conteo_detalle d ON d.id = l.detalle_id
       WHERE d.conteo_id = ? AND d.ubicacion_id = ?
         AND d.operador_id = ? AND d.pda_id = ?
         AND d.estado = 'FINALIZADO'
         AND l.id = (
           SELECT MIN(l2.id) FROM sod_conteo_lectura l2
           WHERE l2.detalle_id = l.detalle_id
         )`,
      [conteo.conteoId, conteo.ubicacionId, conteo.operadorId, conteo.pdaId]
    );

    const primeraLecturaPorDetalle = new Map<number, string>();
    for (const row of (primeraLecturaRow.values ?? []) as Record<string, unknown>[]) {
      primeraLecturaPorDetalle.set(row['detalle_id'] as number, row['fecha_hora'] as string);
    }

    const lecturasPorDetalle = new Map<number, TagFinalizadoLecturaPayload[]>();
    for (const row of (lecturasRow.values ?? []) as Record<string, unknown>[]) {
      const detalleId = row['detalle_id'] as number;
      const lista = lecturasPorDetalle.get(detalleId) ?? [];
      lista.push({
        // Nulo en los ajustes con +/-: mueven unidades sin leer ningún código.
        codigo_lectura: (row['codigo_lectura'] as string | null) ?? null,
        medio_captura:  row['medio_captura']  as MedioCaptura,
        cantidad:       row['cantidad']       as number,
      });
      lecturasPorDetalle.set(detalleId, lista);
    }

    const detalles = (detallesRow.values ?? []).map((row: Record<string, unknown>) => ({
      detalle_uid: detalleUid(
        cargaUid,
        row['detalle_id'] as number,
        // Sin lecturas la línea viene de antes de que existiera esa tabla; la
        // fecha del detalle es lo más cercano que hay al momento del conteo.
        primeraLecturaPorDetalle.get(row['detalle_id'] as number)
          ?? (row['fecha_hora'] as string),
      ),
      codigo_lectura:  (row['codigo_lectura'] as string | null) ?? null,
      sku:            row['sku']            as string,
      codigo_barras:  row['codigo_barras']  as string | null,
      descripcion:    row['descripcion']    as string | null,
      stock_sistema:  row['stock_sistema']  as number | null,
      cantidad_fisica: row['cantidad_fisica'] as number,
      fecha_hora:     row['fecha_hora']     as string,
      // Vacío solo si la línea viene de antes de esta versión de la base.
      lecturas:       lecturasPorDetalle.get(row['detalle_id'] as number) ?? [],
    }));

    return {
      carga_uid:         cargaUid,
      codigo_tienda:     meta['codigo_tienda']     as string,
      fecha_programada:  meta['fecha_programada']  as string,
      iteracion:         conteo.iteracion,
      tag_codigo:        (meta['tag_codigo'] as string ?? conteo.tag ?? ''),
      zona_nombre:       normalizarZonaNombre(meta['zona_nombre'] as string ?? ''),
      zona_descripcion:  meta['zona_descripcion']  as string | null,
      operador_rut:      meta['operador_rut']      as string,
      operador_login:    meta['operador_login']    as string,
      pda_codigo:        meta['pda_codigo']        as string,
      codigo_muestra:    (meta['codigo_muestra'] as string | null) ?? null,
      id_agenda:         (meta['id_agenda'] as number | null) ?? null,
      numero_agenda:     (meta['numero_agenda'] as string | null) ?? null,
      ubicacion_codigo:  meta['ubicacion_codigo']  as string,
      detalles,
    };
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
      codigoLectura: (row['codigo_lectura'] as string | null) ?? null,
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
