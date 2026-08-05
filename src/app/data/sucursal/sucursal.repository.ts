import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { SucursalParaGuardar, SucursalRepository } from '../../domain/sucursal/repositories/sucursal.repository';
import { Sucursal } from '../../domain/sucursal/models/sucursal.model';

@Injectable({ providedIn: 'root' })
export class SqliteSucursalRepository implements SucursalRepository {
  private connection = inject(SqliteConnectionService);

  async getIdPorCodigo(codigoTienda: string): Promise<number | null> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const row = await db.query(
      `SELECT id FROM sod_sucursal WHERE codigo_tienda = ?`,
      [codigoTienda]
    );
    return (row.values?.[0]?.['id'] as number | undefined) ?? null;
  }

  /*
   * Transaccional: una sucursal sin su fila en sod_user_sucursal es invisible
   * para getByUsuario(), así que escribir solo la primera mitad es peor que no
   * escribir nada.
   */
  async guardarDeUsuario(userId: number, tiendas: SucursalParaGuardar[]): Promise<void> {
    if (tiendas.length === 0) return;

    await this.connection.enTransaccion(SODIMAC_DB_NAME, async (db) => {
      for (const tienda of tiendas) {
        /*
         * codigo_tienda es UNIQUE: sirve de identidad estable entre el backend y
         * la base local, cuyo id es AUTOINCREMENT propio.
         */
        await db.run(
          `INSERT INTO sod_sucursal (codigo_tienda, nombre)
           VALUES (?, ?)
           ON CONFLICT (codigo_tienda) DO UPDATE SET nombre = excluded.nombre`,
          [tienda.codigoTienda, tienda.nombre],
          false
        );

        const row = await db.query(
          `SELECT id FROM sod_sucursal WHERE codigo_tienda = ?`,
          [tienda.codigoTienda]
        );
        const sucursalId = row.values?.[0]?.['id'] as number | undefined;
        if (sucursalId === undefined) {
          throw new Error(`No se pudo recuperar la sucursal ${tienda.codigoTienda}`);
        }

        /*
         * sod_user_sucursal no tiene UNIQUE, así que la idempotencia va con un
         * INSERT condicional en vez de ON CONFLICT.
         */
        await db.run(
          `INSERT INTO sod_user_sucursal (user_id, sucursal_id)
           SELECT ?, ?
           WHERE NOT EXISTS (
             SELECT 1 FROM sod_user_sucursal WHERE user_id = ? AND sucursal_id = ?
           )`,
          [userId, sucursalId, userId, sucursalId],
          false
        );
      }
    });
  }

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
