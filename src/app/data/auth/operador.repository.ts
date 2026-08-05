import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { OperadorCacheado } from '../../domain/auth/models/operador-cacheado.model';
import { OperadorParaGuardar, OperadorRepository } from '../../domain/auth/repositories/operador.repository';
import { ROL_POR_DEFECTO } from '../../domain/auth/constants/rol.constants';

/*
 * Misma regla que usa el backend para armar nombre_completo: nombres +
 * apellidos, salteando los vacíos.
 */
function armarNombreCompleto(
  nombres: string | null,
  apellidoPaterno: string | null,
  apellidoMaterno: string | null
): string | null {
  const partes = [nombres, apellidoPaterno, apellidoMaterno]
    .map((p) => p?.trim())
    .filter((p): p is string => !!p);
  return partes.length > 0 ? partes.join(' ') : null;
}

@Injectable({ providedIn: 'root' })
export class SqliteOperadorRepository implements OperadorRepository {
  private connection = inject(SqliteConnectionService);

  async asegurarOperador(rut: number, rutDv: string, correo: string): Promise<number> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    const rolId = await this.rolIdPorDefecto(db);

    /*
     * INSERT condicional: si el operador ya está, esto no escribe nada y el
     * perfil que dejó la sincronización queda intacto. El rol arranca en el por
     * defecto y lo corrige guardarPerfil() cuando llega el cargo real.
     */
    await db.run(
      `INSERT INTO sod_user (rol_id, rut, rut_dv, correo)
       SELECT ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM sod_user WHERE rut = ? AND rut_dv = ?)`,
      [rolId, rut, rutDv, correo, rut, rutDv]
    );

    return this.idPorRut(db, rut, rutDv);
  }

  async guardarPerfil(op: OperadorParaGuardar): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    /*
     * El cargo que manda el backend coincide con sod_rol.nombre ('Operador de
     * Inventario', 'Coordinador', ...). Si no llega o no está sembrado, cae al
     * rol por defecto.
     */
    const rolId = (await this.rolIdPorNombre(db, op.cargo)) ?? (await this.rolIdPorDefecto(db));

    await db.run(
      `INSERT INTO sod_user
         (rol_id, rut, rut_dv, nombres, apellido_paterno, apellido_materno, correo)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (rut, rut_dv) DO UPDATE SET
         rol_id           = excluded.rol_id,
         nombres          = excluded.nombres,
         apellido_paterno = excluded.apellido_paterno,
         apellido_materno = excluded.apellido_materno,
         correo           = excluded.correo`,
      [rolId, op.rut, op.rutDv, op.nombres, op.apellidoPaterno, op.apellidoMaterno, op.correo]
    );
  }

  private async rolIdPorNombre(
    db: Awaited<ReturnType<SqliteConnectionService['getConnection']>>,
    nombre: string | null
  ): Promise<number | undefined> {
    if (!nombre) return undefined;
    const row = await db.query(`SELECT id FROM sod_rol WHERE nombre = ?`, [nombre]);
    return row.values?.[0]?.['id'] as number | undefined;
  }

  /*
   * El rol por defecto se busca por nombre, nunca por id: el id depende del
   * orden del seed de sod_rol y ese orden no es un contrato.
   */
  private async rolIdPorDefecto(
    db: Awaited<ReturnType<SqliteConnectionService['getConnection']>>
  ): Promise<number> {
    const rolId = await this.rolIdPorNombre(db, ROL_POR_DEFECTO);
    if (rolId === undefined) {
      throw new Error(
        `sod_rol no tiene el rol por defecto "${ROL_POR_DEFECTO}": el seed del esquema no se aplicó.`
      );
    }
    return rolId;
  }

  private async idPorRut(
    db: Awaited<ReturnType<SqliteConnectionService['getConnection']>>,
    rut: number,
    rutDv: string
  ): Promise<number> {
    const row = await db.query(
      `SELECT id FROM sod_user WHERE rut = ? AND rut_dv = ?`,
      [rut, rutDv]
    );
    const localId = row.values?.[0]?.['id'] as number | undefined;
    if (localId === undefined) {
      throw new Error(`No se pudo recuperar el id del operador rut=${rut}${rutDv}`);
    }
    return localId;
  }

  async obtenerPorRut(rut: number, rutDv: string): Promise<OperadorCacheado | null> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT u.*, r.nombre AS cargo
       FROM sod_user u
       LEFT JOIN sod_rol r ON r.id = u.rol_id
       WHERE u.rut = ? AND u.rut_dv = ?`,
      [rut, rutDv]
    );
    const row = result.values?.[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapRow(row);
  }

  private mapRow(row: Record<string, unknown>): OperadorCacheado {
    const nombres         = row['nombres']          as string | null;
    const apellidoPaterno = row['apellido_paterno'] as string | null;
    const apellidoMaterno = row['apellido_materno'] as string | null;

    return {
      id:              row['id']               as number,
      rolId:           row['rol_id']           as number,
      cargo:           row['cargo']            as string | null,
      rut:             row['rut']              as number,
      rutDv:           row['rut_dv']           as string,
      nombres,
      apellidoPaterno,
      apellidoMaterno,
      nombreCompleto:  armarNombreCompleto(nombres, apellidoPaterno, apellidoMaterno),
      correo:          row['correo']           as string,
      fechaRegistro:   row['fecha_registro']   as string,
    };
  }
}
