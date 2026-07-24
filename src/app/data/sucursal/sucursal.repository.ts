import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { SucursalRepository } from '../../domain/sucursal/repositories/sucursal.repository';
import { Sucursal } from '../../domain/sucursal/models/sucursal.model';

@Injectable({ providedIn: 'root' })
export class SqliteSucursalRepository implements SucursalRepository {
  private connection = inject(SqliteConnectionService);

  async getByUsuario(userId: number): Promise<Sucursal[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT s.id, s.codigo_tienda, s.nombre, s.zona_operativa, s.activo
       FROM sod_sucursal s
       JOIN sod_user_sucursal us ON us.sucursal_id = s.id
       WHERE us.user_id = ?
       ORDER BY s.nombre`,
      [userId]
    );
    return (result.values ?? []).map((r: Record<string, unknown>) => ({
      id:            r['id']             as number,
      codigoTienda:  r['codigo_tienda']  as string,
      nombre:        r['nombre']         as string,
      zonaOperativa: r['zona_operativa'] as string | null,
      activo:        (r['activo'] as number) === 1,
    }));
  }
}
