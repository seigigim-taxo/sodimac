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
      `SELECT z.id, z.sucursal_id, z.nombre, z.descripcion
       FROM sod_zona z
       WHERE z.sucursal_id = ?
       ORDER BY z.nombre ASC`,
      [sucursalId]
    );
    const zonas = (result.values ?? []).map((row: Record<string, unknown>) => this.map(row));
    console.log('[ZonaRepo] getBySucursal', { sucursalId, total: zonas.length });
    console.table(zonas);
    return zonas;
  }

  /*
   * Guarda/actualiza zonas de forma idempotente: no borra zonas existentes
   * porque sod_conteo_detalle puede estar referenciando ubicaciones de esas zonas.
   * Si la zona ya existe (por sucursal_id + nombre), actualiza la descripción.
   * Si no existe, la inserta.
   */
  async reemplazarDeSucursal(sucursalId: number, zonas: ZonaParaGuardar[]): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    for (const z of zonas) {
      const existing = await db.query(
        `SELECT id FROM sod_zona WHERE sucursal_id = ? AND nombre = ? LIMIT 1`,
        [sucursalId, z.nombre]
      );
      const id = existing.values?.[0]?.['id'] as number | undefined;

      if (id !== undefined) {
        await db.run(
          `UPDATE sod_zona SET descripcion = ? WHERE id = ?`,
          [z.descripcion, id]
        );
      } else {
        await db.run(
          `INSERT INTO sod_zona (sucursal_id, nombre, descripcion)
           VALUES (?, ?, ?)`,
          [sucursalId, z.nombre, z.descripcion]
        );
      }
    }

    const tablaZona = await db.query(`SELECT * FROM sod_zona WHERE sucursal_id = ?`, [sucursalId]);
    console.log('[DB] Tabla sod_zona (sucursal', sucursalId, '):');
    console.table(tablaZona.values);
  }

  private map(row: Record<string, unknown>): Zona {
    return {
      id:          row['id']          as number,
      sucursalId:  row['sucursal_id'] as number,
      nombre:      row['nombre']      as string,
      descripcion: row['descripcion'] as string | null,
    };
  }
}
