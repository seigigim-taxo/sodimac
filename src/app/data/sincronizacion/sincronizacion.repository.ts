import { Injectable, inject, isDevMode } from '@angular/core';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { SincronizacionRepository } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { GuardarSyncTagInput, GuardarSyncValidacionInput, GuardarSyncVersionReportInput, SincronizacionSync } from '../../domain/sincronizacion/models/sincronizacion-sync.model';
import { EnvioTag, EstadoEnvioTag } from '../../domain/sincronizacion/models/estado-envio-tag.model';
import { ahoraSql, hoySql, manianaSql } from '../../shared/utils/fecha.utils';

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

  /*
   * Si la fila ya existe, solo se reemplaza cuando es un ERROR: ahí se sabe que
   * el servidor no tiene el TAG y el payload puede haber cambiado.
   *
   * Una fila ENVIADO o PENDIENTE (en duda) no se toca. Reiniciarla a PENDIENTE
   * con intentos en 0 borraba la prueba de que el servidor ya lo tenía, y
   * reescribir su payload hacía que el reenvío ya no fuera el mismo que el
   * servidor recibió — que es justo lo que termina en un 409.
   */
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
         fecha_envio = NULL
       WHERE sod_sincronizacion.estado = 'ERROR'`,
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

  /*
   * Pendientes que TODAVÍA se pueden enviar: los de la ventana operativa.
   *
   * Un conteo vale para la jornada a la que pertenece. Si no alcanzó a subir
   * mientras esa jornada estaba vigente, se da por perdido y no se manda
   * después: llegar al SGO con fecha corrida ensucia el análisis de diferencias
   * más de lo que aporta recuperar el dato.
   *
   * Mañana entra en el corte porque el operador puede adelantar esa jornada.
   * Cuando el filtro era solo el día en curso, un TAG cerrado contra el evento
   * de mañana no aparecía nunca acá: se cerraba bien, quedaba PENDIENTE y no se
   * ofrecía para envío jamás. Se perdía en silencio.
   *
   * Las filas no se borran ni se marcan — quedan en la tabla como registro de
   * lo que no llegó. Simplemente dejan de ofrecerse para envío.
   *
   * El corte es por la fecha PROGRAMADA del evento, que es el día al que
   * corresponde el conteo, y no por cuándo se cerró el TAG.
   */
  async listarPendientes(): Promise<SincronizacionSync[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT s.* FROM sod_sincronizacion s
       LEFT JOIN sod_evento_inventario e ON e.id = s.evento_id
       WHERE s.estado IN ('PENDIENTE', 'ERROR')
         AND s.tipo = 'CARGA_DESDE_PDA'
         AND (
           (s.operacion = 'TAG_FINALIZADO' AND substr(e.fecha_programada, 1, 10) IN (?, ?))
           OR s.operacion = 'VALIDACION_OPERACIONAL'
           OR s.operacion = 'VERSION_REPORTE'
         )
       ORDER BY s.fecha_hora ASC`,
      [hoySql(), manianaSql()]
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

  async marcarEnviadoConDiferencias(cargaUid: string, registrosProcesados: number, diferencias: string): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `UPDATE sod_sincronizacion
       SET estado = 'ENVIADO',
           error = ?,
           fecha_envio = ?,
           fecha_ultimo_intento = ?,
           intentos = intentos + 1,
           registros_procesados = ?
       WHERE carga_uid = ?`,
      [diferencias, ahoraSql(), ahoraSql(), registrosProcesados, cargaUid]
    );
    if (isDevMode()) {
      console.log('[SincronizacionRepo] marcarEnviadoConDiferencias', { cargaUid, diferencias });
    }
  }

  /*
   * Un ERROR nunca baja un ENVIADO: si dos intentos se cruzan (uno automático y
   * uno manual) y el que falla termina después del que llegó, el TAG tiene que
   * seguir figurando como recibido.
   */
  async marcarError(cargaUid: string, error: string): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `UPDATE sod_sincronizacion
       SET estado = 'ERROR',
           error = ?,
           fecha_ultimo_intento = ?,
           intentos = intentos + 1
       WHERE carga_uid = ? AND estado != 'ENVIADO'`,
      [error, ahoraSql(), cargaUid]
    );
    if (isDevMode()) {
      console.log('[SincronizacionRepo] marcarError', { cargaUid, error });
    }
  }

  async limpiarEnviosHuerfanos(): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `DELETE FROM sod_sincronizacion
       WHERE operacion = 'TAG_FINALIZADO' AND estado = 'ERROR'
         AND conteo_id IS NOT NULL AND ubicacion_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM sod_conteo_detalle d
           WHERE d.conteo_id = sod_sincronizacion.conteo_id
             AND d.ubicacion_id = sod_sincronizacion.ubicacion_id
         )`
    );
  }

  async listarEnviadosPorSanar(): Promise<SincronizacionSync[]> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT s.* FROM sod_sincronizacion s
       WHERE s.operacion = 'TAG_FINALIZADO' AND s.estado = 'ENVIADO'
         AND s.conteo_id IS NOT NULL AND s.ubicacion_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM sod_conteo_detalle d
           WHERE d.conteo_id = s.conteo_id AND d.ubicacion_id = s.ubicacion_id
             AND d.estado = 'FINALIZADO'
         )
       ORDER BY s.fecha_hora ASC`
    );
    return (result.values ?? []).map((row: Record<string, unknown>) => this.map(row));
  }

  async marcarSinRespuesta(cargaUid: string, error: string): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `UPDATE sod_sincronizacion
       SET estado = 'PENDIENTE',
           error = ?,
           fecha_ultimo_intento = ?,
           intentos = intentos + 1
       WHERE carga_uid = ? AND estado != 'ENVIADO'`,
      [error, ahoraSql(), cargaUid]
    );
    if (isDevMode()) {
      console.log('[SincronizacionRepo] marcarSinRespuesta', { cargaUid, error });
    }
  }

  async obtenerEnvio(cargaUid: string): Promise<SincronizacionSync | null> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(`SELECT * FROM sod_sincronizacion WHERE carga_uid = ?`, [cargaUid]);
    const row = result.values?.[0] as Record<string, unknown> | undefined;
    return row ? this.map(row) : null;
  }

  async estadoEnvioTag(conteoId: number, ubicacionId: number): Promise<EnvioTag> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    /*
     * Si hubiera más de un envío para el mismo TAG, manda el más restrictivo:
     * uno recibido pesa más que uno en duda, y uno en duda más que un error.
     */
    const result = await db.query(
      `SELECT carga_uid, estado, error
       FROM sod_sincronizacion
       WHERE operacion = 'TAG_FINALIZADO' AND conteo_id = ? AND ubicacion_id = ?
       ORDER BY CASE estado WHEN 'ENVIADO' THEN 0 WHEN 'PENDIENTE' THEN 1 ELSE 2 END, id DESC
       LIMIT 1`,
      [conteoId, ubicacionId]
    );
    const row = result.values?.[0] as Record<string, unknown> | undefined;
    if (!row) return { estado: 'SIN_ENVIO', cargaUid: null, detalle: null };

    const estado: EstadoEnvioTag =
      row['estado'] === 'ENVIADO'   ? 'ENVIADO'
      : row['estado'] === 'PENDIENTE' ? 'EN_DUDA'
      : 'NO_RECIBIDO';

    return {
      estado,
      cargaUid: row['carga_uid'] as string | null,
      detalle: (row['error'] as string | null) ?? null,
    };
  }

  async guardarSyncValidacion(input: GuardarSyncValidacionInput): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const payloadJson = JSON.stringify(input.payload);

    await db.run(
      `INSERT INTO sod_sincronizacion (
         evento_id, pda_id, tipo, operacion, perfil, iteracion,
         conteo_id, ubicacion_id, operador_id, carga_uid, payload_json, estado
       ) VALUES (?, ?, 'CARGA_DESDE_PDA', 'VALIDACION_OPERACIONAL', 'ANALISTA_CLIENTE', 2, NULL, NULL, NULL, ?, ?, 'PENDIENTE')
       ON CONFLICT (carga_uid) DO UPDATE SET
         payload_json = excluded.payload_json,
         estado = 'PENDIENTE',
         error = NULL,
         intentos = 0,
         fecha_ultimo_intento = NULL,
         fecha_envio = NULL`,
      [
        input.eventoId, input.pdaId,
        input.cargaUid, payloadJson,
      ]
    );
    if (isDevMode()) {
      console.log('[SincronizacionRepo] guardarSyncValidacion', { cargaUid: input.cargaUid });
    }
  }

  async guardarSyncVersionReport(input: GuardarSyncVersionReportInput): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const payloadJson = JSON.stringify(input.payload);

    await db.run(
      `INSERT INTO sod_sincronizacion (
         pda_id, tipo, operacion, perfil, iteracion,
         conteo_id, ubicacion_id, operador_id, carga_uid, payload_json, estado
       ) VALUES (?, 'CARGA_DESDE_PDA', 'VERSION_REPORTE', 'OPERADOR', 1, NULL, NULL, NULL, ?, ?, 'PENDIENTE')
       ON CONFLICT (carga_uid) DO UPDATE SET
         payload_json = excluded.payload_json,
         estado = 'PENDIENTE',
         error = NULL,
         intentos = 0,
         fecha_ultimo_intento = NULL,
         fecha_envio = NULL`,
      [
        input.pdaId,
        input.cargaUid, payloadJson,
      ]
    );
    if (isDevMode()) {
      console.log('[SincronizacionRepo] guardarSyncVersionReport', { cargaUid: input.cargaUid });
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
