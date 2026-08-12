import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { LineaMuestraParaGuardar, MuestraDetalleRepository, CodigoProductoMuestra } from '../../domain/muestra/repositories/muestra-detalle.repository';
import { MuestraDetalle } from '../../domain/muestra/models/muestra-detalle.model';

@Injectable({ providedIn: 'root' })
export class SqliteMuestraDetalleRepository implements MuestraDetalleRepository {
  private connection = inject(SqliteConnectionService);

  /*
   * Transaccional, y acá importa más que en ningún otro lado: el DELETE del
   * detalle va antes de los INSERT. Si falla a mitad sin transacción, la muestra
   * queda sin líneas y el operador no puede contar nada.
   */
  async reemplazarDetalles(muestraId: number, lineas: LineaMuestraParaGuardar[]): Promise<void> {
    await this.connection.enTransaccion(SODIMAC_DB_NAME, async (db) => {
      /*
       * Los productos se dan de alta o se actualizan, pero NUNCA se borran:
       * sod_conteo.producto_id los referencia y borrar uno rompería conteos ya
       * hechos. Un producto que sale de la muestra simplemente deja de tener
       * línea de detalle.
       */
      for (const linea of lineas) {
        const skuNormalizado = linea.sku.trim().toUpperCase();
        await db.run(
          `INSERT INTO sod_producto (sku, codigo_barras, descripcion)
           VALUES (?, ?, ?)
           ON CONFLICT (sku) DO UPDATE SET
             codigo_barras = excluded.codigo_barras,
             descripcion   = excluded.descripcion`,
          [skuNormalizado, linea.codigoBarras, linea.descripcion],
          false
        );

        /* Recuperar producto_id para vincular códigos y detalle */
        const prodRow = await db.query(
          `SELECT id FROM sod_producto WHERE sku = ?`,
          [skuNormalizado]
        );
        const productoId = prodRow.values?.[0]?.['id'] as number | undefined;
        if (productoId === undefined) {
          throw new Error(`No se pudo resolver producto para SKU ${skuNormalizado}`);
        }

        /*
         * Reemplazo completo de códigos de lectura para este producto.
         */
        await db.run(
          `DELETE FROM sod_producto_detalle WHERE producto_id = ?`,
          [productoId],
          false
        );

        for (const codigo of linea.codigos) {
          const lectura = codigo.codigoLectura.trim().toUpperCase();
          if (!lectura) continue;
          await db.run(
            `INSERT INTO sod_producto_detalle (producto_id, codigo_lectura, tipo_codigo, codigo_barras)
             VALUES (?, ?, ?, ?)
             ON CONFLICT (codigo_lectura) DO UPDATE SET
               producto_id = excluded.producto_id,
               tipo_codigo = excluded.tipo_codigo,
               codigo_barras = excluded.codigo_barras`,
            [productoId, lectura, codigo.tipoCodigo, codigo.codigoBarras],
            false
          );
        }
      }

      /*
       * Reemplazo completo del detalle. Es seguro porque ninguna tabla tiene FK
       * contra sod_muestra_detalle: son datos derivados de la muestra.
       */
      await db.run(`DELETE FROM sod_muestra_detalle WHERE muestra_id = ?`, [muestraId], false);

      for (const linea of lineas) {
        const skuNormalizado = linea.sku.trim().toUpperCase();
        await db.run(
          `INSERT INTO sod_muestra_detalle (muestra_id, producto_id, stock_sistema)
           SELECT ?, id, ? FROM sod_producto WHERE sku = ?`,
          [muestraId, linea.stockSistema, skuNormalizado],
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
    console.log('[MuestraDetalle] getByMuestra(', muestraId, ') devolvió', detalles.length, 'detalles');
    console.log('[MuestraDetalle] SKUs:', detalles.map(d => ({ sku: d.sku, productoId: d.productoId })));
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
