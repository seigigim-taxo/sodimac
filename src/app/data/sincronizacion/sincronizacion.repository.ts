import { Injectable, inject, isDevMode } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { SincronizacionRepository } from '../../domain/sincronizacion/repositories/sincronizacion.repository';

@Injectable({ providedIn: 'root' })
export class SqliteSincronizacionRepository implements SincronizacionRepository {
  private connection = inject(SqliteConnectionService);

  async registrarCarga(eventoId: number, pdaId: number, registrosProcesados: number): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `INSERT INTO sod_sincronizacion (evento_id, pda_id, tipo, registros_procesados)
       VALUES (?, ?, 'CARGA_DESDE_PDA', ?)`,
      [eventoId, pdaId, registrosProcesados]
    );
    if (isDevMode()) {
      console.log('[SincronizacionRepo] registrarCarga', { eventoId, pdaId, registrosProcesados });
    }
  }
}
