import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { ZonaParaGuardar, ZonaRepository } from '../../domain/zona/repositories/zona.repository';
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
    console.log('[ZonaRepo] getBySucursal', { sucursalId, total: zonas.length });
    console.table(zonas);
    return zonas;
  }

  /*
   * Reemplazo completo: se borran las ubicaciones y zonas existentes de la
   * sucursal y se insertan las nuevas. El orden importa: sod_ubicacion tiene
   * FK a sod_zona(id), así que hay que limpiar ubicaciones antes que zonas.
   */
  async reemplazarDeSucursal(sucursalId: number, zonas: ZonaParaGuardar[]): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    await db.run(
      `DELETE FROM sod_ubicacion WHERE zona_id IN (SELECT id FROM sod_zona WHERE sucursal_id = ?)`,
      [sucursalId]
    );
    await db.run(`DELETE FROM sod_zona WHERE sucursal_id = ?`, [sucursalId]);

    for (const z of zonas) {
      await db.run(
        `INSERT INTO sod_zona (sucursal_id, zona_tipo_id, codigo, nombre)
         VALUES (?, ?, ?, ?)`,
        [sucursalId, z.zonaTipoId, z.codigo, z.nombre]
      );
    }
    
    const tablaZona = await db.query(`SELECT * FROM sod_zona`, []);
    console.log('[DB] Tabla sod_zona completa:');
    console.table(tablaZona.values);
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
