import { Injectable, inject, isDevMode } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { SincronizacionRepository } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { GuardarSyncTagInput, SincronizacionSync } from '../../domain/sincronizacion/models/sincronizacion-sync.model';
import { ahoraSql } from '../../shared/utils/fecha.utils';

@Injectable({ providedIn: 'root' })
export class SqliteSincronizacionRepository implements SincronizacionRepository {
  private connection = inject(SqliteConnectionService);

  async registrarCarga(eventoId: number, pdaId: number, registrosProcesados: number): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `INSERT INTO sod_sincronizacion (evento_id, pda_id, tipo, registros_procesados, fecha_hora)
       VALUES (?, ?, 'CARGA_DESDE_PDA', ?, ?)`,
      [eventoId, pdaId, registrosProcesados, ahoraSql()]
    );
    if (isDevMode()) {
      console.log('[SincronizacionRepo] registrarCarga', { eventoId, pdaId, registrosProcesados });
    }
  }

  async guardarSyncTag(input: GuardarSyncTagInput): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const payloadJson = JSON.stringify(input.payload);

    await db.run(
      `INSERT INTO sod_sincronizacion (
         evento_id, pda_id, tipo, operacion, perfil, iteracion,
         conteo_id, ubicacion_id, operador_id, carga_uid, payload_json, estado, fecha_hora
       ) VALUES (?, ?, 'CARGA_DESDE_PDA', 'TAG_FINALIZADO', ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)
       ON CONFLICT (carga_uid) DO UPDATE SET
         payload_json = excluded.payload_json,
         estado = 'PENDIENTE',
         error = NULL,
         intentos = 0,
         fecha_ultimo_intento = NULL,
         fecha_envio = NULL`,
      [
        input.eventoId, input.pdaId, input.perfil, input.iteracion,
        input.conteoId, input.ubicacionId, input.operadorId,
        input.cargaUid, payloadJson, ahoraSql(),
      ]
    );
    if (isDevMode()) {
      console.log('[SincronizacionRepo] guardarSyncTag', { cargaUid: input.cargaUid, perfil: input.perfil });
    }
  }

  async listarPendientes(): Promise<SincronizacionSync[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT * FROM sod_sincronizacion
       WHERE estado IN ('PENDIENTE', 'ERROR') AND tipo = 'CARGA_DESDE_PDA' AND operacion = 'TAG_FINALIZADO'
       ORDER BY fecha_hora ASC`
    );
    return (result.values ?? []).map((row: Record<string, unknown>) => this.map(row));
  }

  async marcarEnviado(cargaUid: string, registrosProcesados: number): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `UPDATE sod_sincronizacion
       SET estado = 'ENVIADO',
           error = NULL,
           fecha_envio = ?,
           fecha_ultimo_intento = ?,
           intentos = intentos + 1,
           registros_procesados = ?
       WHERE carga_uid = ?`,
      [ahoraSql(), ahoraSql(), registrosProcesados, cargaUid]
    );
    if (isDevMode()) {
      console.log('[SincronizacionRepo] marcarEnviado', { cargaUid });
    }
  }

  async marcarError(cargaUid: string, error: string): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `UPDATE sod_sincronizacion
       SET estado = 'ERROR',
           error = ?,
           fecha_ultimo_intento = ?,
           intentos = intentos + 1
       WHERE carga_uid = ?`,
      [error, ahoraSql(), cargaUid]
    );
    if (isDevMode()) {
      console.log('[SincronizacionRepo] marcarError', { cargaUid, error });
    }
  }

  private map(row: Record<string, unknown>): SincronizacionSync {
    return {
      id:                 row['id']                 as number,
      eventoId:           row['evento_id']          as number | null,
      pdaId:              row['pda_id']             as number | null,
      tipo:               row['tipo']               as SincronizacionSync['tipo'],
      operacion:          row['operacion']          as SincronizacionSync['operacion'],
      perfil:             row['perfil']             as SincronizacionSync['perfil'],
      iteracion:          row['iteracion']          as number | null,
      conteoId:           row['conteo_id']          as number | null,
      ubicacionId:        row['ubicacion_id']       as number | null,
      operadorId:         row['operador_id']        as number | null,
      cargaUid:           row['carga_uid']          as string | null,
      payloadJson:        row['payload_json']       as string | null,
      estado:             row['estado']             as SincronizacionSync['estado'],
      error:              row['error']              as string | null,
      intentos:           row['intentos']           as number,
      fechaHora:          row['fecha_hora']         as string,
      fechaUltimoIntento: row['fecha_ultimo_intento'] as string | null,
      fechaEnvio:         row['fecha_envio']        as string | null,
      registrosProcesados: row['registros_procesados'] as number | null,
    };
  }
}
