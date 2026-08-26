import { Injectable, inject } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { MetaRepository } from '../../domain/meta/repositories/meta.repository';

@Injectable({ providedIn: 'root' })
export class SqliteMetaRepository implements MetaRepository {
  private connection = inject(SqliteConnectionService);

  async obtener(clave: string): Promise<string | null> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(`SELECT valor FROM sod_meta WHERE clave = ?`, [clave]);
    const valor = (result.values?.[0] as Record<string, unknown> | undefined)?.['valor'];
    return typeof valor === 'string' ? valor : null;
  }

  async guardar(clave: string, valor: string): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `INSERT INTO sod_meta (clave, valor) VALUES (?, ?)
       ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor`,
      [clave, valor]
    );
  }
}
