import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { MuestraParaGuardar, MuestraRepository } from '../../domain/muestra/repositories/muestra.repository';
import { Muestra } from '../../domain/muestra/models/muestra.model';

@Injectable({ providedIn: 'root' })
export class SqliteMuestraRepository implements MuestraRepository {
    private connection = inject(SqliteConnectionService);

    /* Upsert por codigo_muestra_sv, la clave natural que manda el backend. */
    async asegurarMuestra(muestra: MuestraParaGuardar): Promise<number> {
        const db = await this.connection.getConnection(SODIMAC_DB_NAME);

        await db.run(
            `INSERT INTO sod_muestra (codigo_muestra_sv, evento_id, sucursal_id, nombre)
             VALUES (?, ?, ?, ?)
             ON CONFLICT (codigo_muestra_sv) DO UPDATE SET
               evento_id   = excluded.evento_id,
               sucursal_id = excluded.sucursal_id,
               nombre      = excluded.nombre`,
            [muestra.codigoMuestra, muestra.eventoId, muestra.sucursalId, muestra.nombre]
        );

        const row = await db.query(
            `SELECT id FROM sod_muestra WHERE codigo_muestra_sv = ?`,
            [muestra.codigoMuestra]
        );
        const id = row.values?.[0]?.['id'] as number | undefined;
        if (id === undefined) {
            throw new Error(`No se pudo recuperar la muestra ${muestra.codigoMuestra}`);
        }
        return id;
    }

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
            codigoMuestra: row['codigo_muestra_sv'] as string | null,
            eventoId:      row['evento_id']      as number,
            sucursalId:    row['sucursal_id']    as number,
            nombre:        row['nombre']         as string | null,
            nombreArchivo: row['nombre_archivo'] as string | null,
        };
    }
}