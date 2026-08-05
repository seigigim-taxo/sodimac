import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { ZonaTipoParaGuardar, ZonaTipoRepository } from '../../domain/zona-tipo/repositories/zona-tipo.repository';
import { ZonaTipo } from '../../domain/zona-tipo/models/zona-tipo.model';

@Injectable({ providedIn: 'root' })
export class SqliteZonaTipoRepository implements ZonaTipoRepository {
  private connection = inject(SqliteConnectionService);

  async asegurarTipo(tipo: ZonaTipoParaGuardar): Promise<number> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    await db.run(
      `INSERT OR IGNORE INTO sod_zona_tipo (nombre, descripcion) VALUES (?, ?)`,
      [tipo.nombre, tipo.descripcion]
    );

    const row = await db.query(
      `SELECT id FROM sod_zona_tipo WHERE nombre = ?`,
      [tipo.nombre]
    );
    const id = row.values?.[0]?.['id'] as number | undefined;
    if (id === undefined) {
      throw new Error(`No se pudo recuperar el zona_tipo "${tipo.nombre}"`);
    }
    return id;
  }

  async getAll(): Promise<ZonaTipo[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT id, nombre, descripcion FROM sod_zona_tipo ORDER BY nombre ASC`
    );
    return (result.values ?? []).map((row: Record<string, unknown>) => ({
      id: row['id'] as number,
      nombre: row['nombre'] as string,
      descripcion: (row['descripcion'] as string) ?? null,
    }));
  }
}
