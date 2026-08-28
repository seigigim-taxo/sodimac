import { InjectionToken } from '@angular/core';
import { GuardarSyncTagInput, GuardarSyncValidacionInput, SincronizacionSync } from '../models/sincronizacion-sync.model';

export interface SincronizacionRepository {
  /* Registra en sod_sincronizacion una carga (CARGA_DESDE_PDA) de un conteo. */
  registrarCarga(eventoId: number, pdaId: number, registrosProcesados: number): Promise<void>;

  /* Cola offline de payloads tag-finalizado.php pendientes de envío. */
  guardarSyncTag(input: GuardarSyncTagInput): Promise<void>;
  /*
   * Pendientes que todavía se pueden enviar: solo los del día en curso. Un
   * conteo que no alcanzó a subir en su jornada se da por perdido y no se manda
   * después.
   */
  listarPendientes(): Promise<SincronizacionSync[]>;
  marcarEnviado(cargaUid: string, registrosProcesados: number): Promise<void>;
  marcarError(cargaUid: string, error: string): Promise<void>;

  /* Cola offline de payloads validacion-analista.php pendientes de envío. */
  guardarSyncValidacion(input: GuardarSyncValidacionInput): Promise<void>;
}

export const SINCRONIZACION_REPOSITORY_TOKEN = new InjectionToken<SincronizacionRepository>('SincronizacionRepository');
