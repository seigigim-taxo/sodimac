import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { MuestraRepository } from '../../domain/muestra/repositories/muestra.repository';
import { Muestra } from '../../domain/muestra/models/muestra.model';

@Injectable({ providedIn: 'root' })
export class SqliteMuestraRepository implements MuestraRepository {
    private connection = inject(SqliteConnectionService);

    async getByEvento(eventoId: number): Promise<Muestra | null> {
        const db = await this.connection.getConnection(SODIMAC_DB_NAME);
        const result = await db.query(
            `SELECT * FROM sod_muestra WHERE evento_id = ?`,
            [eventoId]
        );
        const row = result.values?.[0] as Record<string, unknown> | undefined;
        return row ? this.map(row) : null;
    }

    private map(row: Record<string, unknown>): Muestra {
        return {
            id:            row['id']             as number,
            eventoId:      row['evento_id']      as number,
            sucursalId:    row['sucursal_id']    as number,
            nombreArchivo: row['nombre_archivo'] as string | null,
        };
    }
}