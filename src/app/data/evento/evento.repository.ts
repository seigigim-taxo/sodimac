import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { EventoRepository } from '../../domain/evento/repositories/evento.repository';
import { Evento } from '../../domain/evento/models/evento.model';

@Injectable({ providedIn: 'root' })
export class SqliteEventoRepository implements EventoRepository {
    private connection = inject(SqliteConnectionService);

    async getBySucursal(sucursalId: number): Promise<Evento[]> {
        const db = await this.connection.getConnection(SODIMAC_DB_NAME);
        const result = await db.query(
            `SELECT * FROM sod_evento_inventario WHERE sucursal_id = ? ORDER BY fecha_programada DESC`,
            [sucursalId]
        );
        return (result.values ?? []).map((row: Record<string, unknown>) => this.map(row));
    }

    async getById(id: number): Promise<Evento | null> {
        const db = await this.connection.getConnection(SODIMAC_DB_NAME);
        const result = await db.query(
            `SELECT * FROM sod_evento_inventario WHERE id = ?`,
            [id]
        );
        const row = result.values?.[0] as Record<string, unknown> | undefined;
        return row ? this.map(row) : null;
    }

    private map(row: Record<string, unknown>): Evento {
        return {
            id:              row['id']               as number,
            agendaId:        row['agenda_id']        as number | null,
            sucursalId:      row['sucursal_id']      as number,
            operadorId:      row['operador_id']      as number,
            folio:           row['folio']            as string | null,
            fechaProgramada: row['fecha_programada'] as string,
            fechaEjecucion:  row['fecha_ejecucion']  as string | null,
            estado:          row['estado']           as Evento['estado'],
            fechaRegistro:   row['fecha_registro']   as string,
        };
    }
}
