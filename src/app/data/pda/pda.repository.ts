import { Injectable, inject } from '@angular/core';
import { Device } from '@capacitor/device';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { PdaRepository } from '../../domain/pda/repositories/pda.repository';
import { Pda } from '../../domain/pda/models/pda.model';

@Injectable({ providedIn: 'root' })
export class CapacitorPdaRepository implements PdaRepository {
  private connection = inject(SqliteConnectionService);

  async register(): Promise<Pda> {
    const [{ identifier }, { manufacturer, model }] = await Promise.all([
      Device.getId(),
      Device.getInfo(),
    ]);

    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `INSERT INTO sod_pda (codigo, marca, modelo, activo)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(codigo) DO UPDATE SET
         marca  = excluded.marca,
         modelo = excluded.modelo`,
      [identifier, manufacturer ?? null, model ?? null]
    );

    const result = await db.query(`SELECT id, codigo, marca, modelo, activo FROM sod_pda WHERE codigo = ?`, [identifier]);
    const row    = result.values?.[0] as Record<string, unknown>;
    return {
      id:     row['id']     as number,
      codigo: row['codigo'] as string,
      marca:  row['marca']  as string | null,
      modelo: row['modelo'] as string | null,
      activo: Boolean(row['activo']),
    };
  }
}
