import { Injectable, inject } from '@angular/core';
import { isDevMode } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { ZonaRepository } from '../../domain/zona/repositories/zona.repository';
import { Zona } from '../../domain/zona/models/zona.model';

@Injectable({ providedIn: 'root' })
export class SqliteZonaRepository implements ZonaRepository {
  private connection = inject(SqliteConnectionService);

  async getByEventoAndOperador(eventoId: number, operadorId: number): Promise<Zona[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT z.id, z.sucursal_id, z.zona_tipo_id, z.codigo, z.nombre, z.fecha_registro,
              zt.nombre AS zona_tipo_nombre
       FROM sod_zona z
       INNER JOIN sod_zona_tipo zt ON zt.id = z.zona_tipo_id
       INNER JOIN sod_asignacion_zona az ON az.zona_id = z.id
       WHERE az.evento_id = ? AND az.operador_id = ?
       ORDER BY z.codigo ASC`,
      [eventoId, operadorId]
    );
    const zonas = (result.values ?? []).map((row: Record<string, unknown>) => this.map(row));
    if (isDevMode()) {
      console.log('[ZonaRepo] getByEventoAndOperador', { eventoId, operadorId, total: zonas.length });
      console.table(zonas);
    }
    return zonas;
  }

  private map(row: Record<string, unknown>): Zona {
    return {
      id:             row['id']               as number,
      sucursalId:     row['sucursal_id']      as number,
      zonaTipoId:     row['zona_tipo_id']     as number,
      zonaTipoNombre: row['zona_tipo_nombre'] as string,
      codigo:         row['codigo']           as string,
      nombre:         row['nombre']           as string | null,
      fechaRegistro:  row['fecha_registro']   as string,
    };
  }
}
