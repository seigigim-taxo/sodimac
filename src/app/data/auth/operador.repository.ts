import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { OperadorCacheado } from '../../domain/auth/models/operador-cacheado.model';
import { OperadorRepository } from '../../domain/auth/repositories/operador.repository';

@Injectable({ providedIn: 'root' })
export class SqliteOperadorRepository implements OperadorRepository {
  private connection = inject(SqliteConnectionService);

  async guardar(op: OperadorCacheado): Promise<number> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    // 1. Resolver rol_id por nombre (sod_rol ya tiene SEED)
    const rolRow = await db.query(
      `SELECT id FROM sod_rol WHERE id = ?`,
      [op.rolId ?? 1]
    );
    const rolId = (rolRow.values?.[0]?.['id'] as number) ?? 1;

    // 2. Upsert sod_user por (rut, rut_dv) UNIQUE
    await db.run(
      `INSERT OR IGNORE INTO sod_user
         (rol_id, rut, rut_dv, nombres, apellido_paterno, apellido_materno, correo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [rolId, op.rut, op.rutDv, op.nombres, op.apellidoPaterno, op.apellidoMaterno, op.correo]
    );
    await db.run(
      `UPDATE sod_user
       SET rol_id = ?, nombres = ?, apellido_paterno = ?, apellido_materno = ?, correo = ?
       WHERE rut = ? AND rut_dv = ?`,
      [rolId, op.nombres, op.apellidoPaterno, op.apellidoMaterno, op.correo, op.rut, op.rutDv]
    );

    const userRow = await db.query(
      `SELECT id FROM sod_user WHERE rut = ? AND rut_dv = ?`,
      [op.rut, op.rutDv]
    );
    const localId = userRow.values?.[0]?.['id'] as number | undefined;
    if (localId === undefined) {
      throw new Error(`No se pudo recuperar el id del operador rut=${op.rut}${op.rutDv}`);
    }

    return localId;
  }

  async obtenerPorRut(rut: number, rutDv: string): Promise<OperadorCacheado | null> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT * FROM sod_user WHERE rut = ? AND rut_dv = ?`,
      [rut, rutDv]
    );
    const row = result.values?.[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapRow(row);
  }

  private mapRow(row: Record<string, unknown>): OperadorCacheado {
    return {
      id:              row['id']               as number,
      rolId:           row['rol_id']           as number,
      rut:             row['rut']              as number,
      rutDv:           row['rut_dv']           as string,
      nombres:         row['nombres']          as string | null,
      apellidoPaterno: row['apellido_paterno'] as string | null,
      apellidoMaterno: row['apellido_materno'] as string | null,
      correo:          row['correo']           as string,
      fechaRegistro:   row['fecha_registro']   as string,
    };
  }
}
