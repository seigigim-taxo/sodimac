import { Injectable, inject } from '@angular/core';
import { isDevMode } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { ZonaRepository } from '../../domain/zona/repositories/zona.repository';
import { Zona } from '../../domain/zona/models/zona.model';

@Injectable({ providedIn: 'root' })
export class SqliteZonaRepository implements ZonaRepository {
  private connection = inject(SqliteConnectionService);

  /*
   * Sin JOIN contra sod_asignacion: la asignación es operador ↔ evento, no
   * operador ↔ zona. Dentro del evento, el operador elige libremente entre
   * todas las zonas de su tienda.
   */
  async getBySucursal(sucursalId: number): Promise<Zona[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT z.id, z.sucursal_id, z.zona_tipo_id, z.codigo, z.nombre, z.fecha_registro,
              zt.nombre AS zona_tipo_nombre
       FROM sod_zona z
       INNER JOIN sod_zona_tipo zt ON zt.id = z.zona_tipo_id
       WHERE z.sucursal_id = ?
       ORDER BY z.codigo ASC`,
      [sucursalId]
    );
    const zonas = (result.values ?? []).map((row: Record<string, unknown>) => this.map(row));
    if (isDevMode()) {
      console.log('[ZonaRepo] getBySucursal', { sucursalId, total: zonas.length });
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
