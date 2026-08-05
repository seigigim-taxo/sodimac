import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { LineaMuestraParaGuardar, MuestraDetalleRepository } from '../../domain/muestra/repositories/muestra-detalle.repository';
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
        await db.run(
          `INSERT INTO sod_producto (sku, codigo_barras, descripcion)
           VALUES (?, ?, ?)
           ON CONFLICT (sku) DO UPDATE SET
             codigo_barras = excluded.codigo_barras,
             descripcion   = excluded.descripcion`,
          [linea.sku, linea.codigoBarras, linea.descripcion],
          false
        );
      }

      /*
       * Reemplazo completo del detalle. Es seguro porque ninguna tabla tiene FK
       * contra sod_muestra_detalle: son datos derivados de la muestra.
       */
      await db.run(`DELETE FROM sod_muestra_detalle WHERE muestra_id = ?`, [muestraId], false);

      for (const linea of lineas) {
        /*
         * stock_sistema queda en 0: la preparación no lo trae todavía. Mientras
         * siga así, las diferencias van a marcar todo lo contado como sobrante.
         */
        await db.run(
          `INSERT INTO sod_muestra_detalle (id_muestra_det_sv, muestra_id, producto_id, stock_sistema)
           SELECT ?, ?, id, 0 FROM sod_producto WHERE sku = ?`,
          [linea.idMuestraDet, muestraId, linea.sku],
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
    return (result.values ?? []).map((row: Record<string, unknown>) => this.map(row));
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
