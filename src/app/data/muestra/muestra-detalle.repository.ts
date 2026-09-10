import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { LineaMuestraParaGuardar, MuestraDetalleRepository, CodigoProductoMuestra } from '../../domain/muestra/repositories/muestra-detalle.repository';
import { MuestraDetalle } from '../../domain/muestra/models/muestra-detalle.model';

const SQLITE_PARAM_LIMIT = 900;
const BATCH_SIZE = 500;
const MULTI_ROW_PRODUCTO_DETALLE = 200;
const MULTI_ROW_MUESTRA_DETALLE = 300;

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

type SqliteConn = {
  executeSet: (set: { statement: string; values: unknown[] }[], transaction?: boolean) => Promise<unknown>;
  run: (statement: string, values?: unknown[], transaction?: boolean) => Promise<unknown>;
  query: (statement: string, values?: unknown[]) => Promise<{ values?: unknown[] }>;
};

@Injectable({ providedIn: 'root' })
export class SqliteMuestraDetalleRepository implements MuestraDetalleRepository {
  private connection = inject(SqliteConnectionService);

  async reemplazarDetalles(muestraId: number, lineas: LineaMuestraParaGuardar[]): Promise<void> {
    await this.connection.enTransaccion(SODIMAC_DB_NAME, async (db: SqliteConn) => {
      /* 1. Normalizar líneas una sola vez */
      const normalizadas = lineas.map((l) => ({
        sku: l.sku.trim().toUpperCase(),
        codigos: l.codigos
          .map((c) => ({ ...c, codigoLectura: c.codigoLectura.trim().toUpperCase() }))
          .filter((c) => c.codigoLectura),
        stockSistema: l.stockSistema,
        descripcion: l.descripcion,
        codigoBarras: l.codigoBarras,
      }));

      /* 2. Upsert productos en batches */
      const productoUpsertStmt = `INSERT INTO sod_producto (sku, codigo_barras, descripcion)
        VALUES (?, ?, ?)
        ON CONFLICT (sku) DO UPDATE SET
          codigo_barras = excluded.codigo_barras,
          descripcion   = excluded.descripcion`;
      const productoSet: { statement: string; values: unknown[] }[] = normalizadas.map((l) => ({
        statement: productoUpsertStmt,
        values: [l.sku, l.codigoBarras, l.descripcion],
      }));
      for (const batch of chunks(productoSet, BATCH_SIZE)) {
        await db.executeSet(batch, false);
      }

      /* 3. Resolver todos los producto_id en bloque */
      const skusUnicos = [...new Set(normalizadas.map((l) => l.sku))];
      const productoIdPorSku = new Map<string, number>();

      for (const chunk of chunks(skusUnicos, SQLITE_PARAM_LIMIT)) {
        const placeholders = chunk.map(() => '?').join(', ');
        const result = await db.query(
          `SELECT id, sku FROM sod_producto WHERE sku IN (${placeholders})`,
          chunk
        );
        for (const row of (result.values ?? []) as Record<string, unknown>[]) {
          productoIdPorSku.set(row['sku'] as string, row['id'] as number);
        }
      }

      for (const sku of skusUnicos) {
        if (!productoIdPorSku.has(sku)) {
          throw new Error(`No se pudo resolver producto para SKU ${sku}`);
        }
      }

      /* 4. Borrar códigos anteriores en bloque */
      const allIds = [...productoIdPorSku.values()];
      for (const chunk of chunks(allIds, SQLITE_PARAM_LIMIT)) {
        const placeholders = chunk.map(() => '?').join(', ');
        await db.run(
          `DELETE FROM sod_producto_detalle WHERE producto_id IN (${placeholders})`,
          chunk,
          false
        );
      }

      /* 5. Upsert códigos en multi-row chunks */
      const codigoRows: unknown[][] = [];
      for (const linea of normalizadas) {
        const productoId = productoIdPorSku.get(linea.sku)!;
        for (const codigo of linea.codigos) {
          codigoRows.push([productoId, codigo.codigoLectura, codigo.tipoCodigo, codigo.codigoBarras]);
        }
      }
      for (const batch of chunks(codigoRows, MULTI_ROW_PRODUCTO_DETALLE)) {
        const placeholders = batch.map(() => '(?, ?, ?, ?)').join(', ');
        const values: unknown[] = [];
        for (const row of batch) values.push(...row);
        await db.run(
          `INSERT INTO sod_producto_detalle (producto_id, codigo_lectura, tipo_codigo, codigo_barras)
           VALUES ${placeholders}
           ON CONFLICT (codigo_lectura) DO UPDATE SET
             producto_id = excluded.producto_id,
             tipo_codigo = excluded.tipo_codigo,
             codigo_barras = excluded.codigo_barras`,
          values,
          false
        );
      }

      /* 6. Reemplazar detalle de muestra en multi-row chunks */
      await db.run(`DELETE FROM sod_muestra_detalle WHERE muestra_id = ?`, [muestraId], false);

      const detalleRows: unknown[][] = normalizadas.map((l) => [
        muestraId,
        productoIdPorSku.get(l.sku)!,
        l.stockSistema,
      ]);
      for (const batch of chunks(detalleRows, MULTI_ROW_MUESTRA_DETALLE)) {
        const placeholders = batch.map(() => '(?, ?, ?)').join(', ');
        const values: unknown[] = [];
        for (const row of batch) values.push(...row);
        await db.run(
          `INSERT INTO sod_muestra_detalle (muestra_id, producto_id, stock_sistema)
           VALUES ${placeholders}`,
          values,
          false
        );
      }
    });
  }

  async getByMuestra(muestraId: number): Promise<MuestraDetalle[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT md.id, md.muestra_id, md.producto_id, md.stock_sistema, md.ubicacion_esperada,
              p.sku
       FROM sod_muestra_detalle md
       JOIN sod_producto p ON p.id = md.producto_id
       WHERE md.muestra_id = ?`,
      [muestraId]
    );
    const detalles = (result.values ?? []).map((row: Record<string, unknown>) => this.map(row));
    return detalles;
  }

  async getCodigosByMuestra(muestraId: number): Promise<CodigoProductoMuestra[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT pd.codigo_lectura, pd.producto_id
       FROM sod_producto_detalle pd
       JOIN sod_muestra_detalle md ON md.producto_id = pd.producto_id
       WHERE md.muestra_id = ?`,
      [muestraId]
    );
    const codigos: CodigoProductoMuestra[] = [];
    for (const row of (result.values ?? []) as Record<string, unknown>[]) {
      const lectura = (row['codigo_lectura'] as string)?.trim().toUpperCase();
      if (!lectura) continue;
      codigos.push({ codigoLectura: lectura, productoId: row['producto_id'] as number });
    }
    return codigos;
  }

  private map(row: Record<string, unknown>): MuestraDetalle {
    return {
      id:                row['id']                 as number,
      muestraId:         row['muestra_id']         as number,
      productoId:        row['producto_id']        as number,
      sku:               row['sku']                as string,
      stockSistema:      row['stock_sistema']      as number,
      ubicacionEsperada: row['ubicacion_esperada'] as string | null,
    };
  }
}
