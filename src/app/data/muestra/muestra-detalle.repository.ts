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
            `SELECT * FROM sod_muestra_detalle WHERE muestra_id = ?`,
            [muestraId]
        );
        return (result.values ?? []).map((row: Record<string, unknown>) => this.map(row));
    }

    private map(row: Record<string, unknown>): MuestraDetalle {
        return {
            id:                row['id']                 as number,
            muestraId:         row['muestra_id']         as number,
            productoId:        row['producto_id']        as number,
            stockSistema:      row['stock_sistema']      as number,
            ubicacionEsperada: row['ubicacion_esperada'] as string | null,
        };
    }
}