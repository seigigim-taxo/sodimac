import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { MuestraParaGuardar, MuestraRepository } from '../../domain/muestra/repositories/muestra.repository';
import { Muestra } from '../../domain/muestra/models/muestra.model';

@Injectable({ providedIn: 'root' })
export class SqliteMuestraRepository implements MuestraRepository {
    private connection = inject(SqliteConnectionService);

    /* Upsert por (evento_id, iteracion). */
    async asegurarMuestra(muestra: MuestraParaGuardar): Promise<number> {
        const db = await this.connection.getConnection(SODIMAC_DB_NAME);
        const iteracion = muestra.iteracion ?? 1;
        const estado    = muestra.estado ?? 'ACTIVA';

        await db.run(
            `INSERT INTO sod_muestra (evento_id, sucursal_id, iteracion, estado, nombre)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (evento_id, iteracion) DO UPDATE SET
               sucursal_id = excluded.sucursal_id,
               estado      = excluded.estado,
               nombre      = excluded.nombre`,
            [muestra.eventoId, muestra.sucursalId, iteracion, estado, muestra.nombre]
        );

        const row = await db.query(
            `SELECT id FROM sod_muestra WHERE evento_id = ? AND iteracion = ?`,
            [muestra.eventoId, iteracion]
        );
        const id = row.values?.[0]?.['id'] as number | undefined;
        if (id === undefined) {
            throw new Error(`No se pudo recuperar la muestra evento_id=${muestra.eventoId} iteracion=${iteracion}`);
        }

        const tablaCompleta = await db.query(`SELECT * FROM sod_muestra`, []);
        console.log('[DB] Tabla sod_muestra completa:');
        console.table(tablaCompleta.values);

        return id;
    }

    /* Compatibilidad: devuelve la muestra de iteración 1. */
    async getByEvento(eventoId: number): Promise<Muestra | null> {
        return this.getByEventoIteracion(eventoId, 1);
    }

    async getByEventoIteracion(eventoId: number, iteracion: number): Promise<Muestra | null> {
        const db = await this.connection.getConnection(SODIMAC_DB_NAME);
        const result = await db.query(
            `SELECT * FROM sod_muestra WHERE evento_id = ? AND iteracion = ?`,
            [eventoId, iteracion]
        );
        const row = result.values?.[0] as Record<string, unknown> | undefined;
        return row ? this.map(row) : null;
    }

    private map(row: Record<string, unknown>): Muestra {
        return {
            id:            row['id']             as number,
            codigoMuestra: null,
            eventoId:      row['evento_id']      as number,
            sucursalId:    row['sucursal_id']    as number,
            iteracion:     row['iteracion']      as number,
            estado:        row['estado']         as string,
            nombre:        row['nombre']         as string | null,
            nombreArchivo: row['nombre_archivo'] as string | null,
        };
    }
}
