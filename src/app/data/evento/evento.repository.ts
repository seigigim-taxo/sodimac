import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { EventoParaGuardar, EventoRepository } from '../../domain/evento/repositories/evento.repository';
import { Evento } from '../../domain/evento/models/evento.model';

@Injectable({ providedIn: 'root' })
export class SqliteEventoRepository implements EventoRepository {
    private connection = inject(SqliteConnectionService);

    /*
     * Idempotencia por (sucursal_id, fecha_programada): la tabla no tiene
     * UNIQUE, así que el INSERT condicional es lo que evita duplicar el evento
     * en cada sincronización. No actualiza el estado — ese lo maneja el flujo
     * de conteo, y pisarlo desde acá revertiría un evento ya en curso.
     */
    async crearEvento(evento: EventoParaGuardar): Promise<number> {
        const db = await this.connection.getConnection(SODIMAC_DB_NAME);

        await db.run(
            `INSERT INTO sod_evento_inventario (sucursal_id, nombre, fecha_programada, estado)
             VALUES (?, ?, ?, ?)`,
            [evento.sucursalId, evento.nombre, evento.fechaProgramada, evento.estado]
        );

        const row = await db.query(
            `SELECT id FROM sod_evento_inventario
             WHERE sucursal_id = ? AND fecha_programada = ?
             ORDER BY id DESC LIMIT 1`,
            [evento.sucursalId, evento.fechaProgramada]
        );
        const id = row.values?.[0]?.['id'] as number | undefined;
        if (id === undefined) {
            throw new Error(
                `No se pudo crear el evento de la sucursal ${evento.sucursalId} para ${evento.fechaProgramada}`
            );
        }

        return id;
    }

    async asegurarEvento(evento: EventoParaGuardar): Promise<number> {
        const db = await this.connection.getConnection(SODIMAC_DB_NAME);

        await db.run(
            `INSERT INTO sod_evento_inventario (sucursal_id, nombre, fecha_programada, estado)
             SELECT ?, ?, ?, ?
             WHERE NOT EXISTS (
               SELECT 1 FROM sod_evento_inventario
               WHERE sucursal_id = ? AND fecha_programada = ?
             )`,
            [
                evento.sucursalId, evento.nombre, evento.fechaProgramada, evento.estado,
                evento.sucursalId, evento.fechaProgramada,
            ]
        );

        const row = await db.query(
            `SELECT id FROM sod_evento_inventario
             WHERE sucursal_id = ? AND fecha_programada = ?`,
            [evento.sucursalId, evento.fechaProgramada]
        );
        const id = row.values?.[0]?.['id'] as number | undefined;
        if (id === undefined) {
            throw new Error(
                `No se pudo recuperar el evento de la sucursal ${evento.sucursalId} para ${evento.fechaProgramada}`
            );
        }

        return id;
    }

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

    async updateEstado(id: number, estado: Evento['estado']): Promise<void> {
        const db = await this.connection.getConnection(SODIMAC_DB_NAME);
        await db.run(
            `UPDATE sod_evento_inventario SET estado = ? WHERE id = ?`,
            [estado, id]
        );
    }

    private map(row: Record<string, unknown>): Evento {
        return {
            id:              row['id']               as number,
            sucursalId:      row['sucursal_id']      as number,
            nombre:          row['nombre']           as string,
            fechaProgramada: row['fecha_programada'] as string,
            fechaEjecucion:  row['fecha_ejecucion']  as string | null,
            estado:          row['estado']           as Evento['estado'],
            fechaRegistro:   row['fecha_registro']   as string,
        };
    }
}
