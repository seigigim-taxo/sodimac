import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { MuestraDetalleRepository } from '../../domain/muestra/repositories/muestra-detalle.repository';
import { MuestraDetalle } from '../../domain/muestra/models/muestra-detalle.model';

@Injectable({ providedIn: 'root' })
export class SqliteMuestraDetalleRepository implements MuestraDetalleRepository {
  private connection = inject(SqliteConnectionService);

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
