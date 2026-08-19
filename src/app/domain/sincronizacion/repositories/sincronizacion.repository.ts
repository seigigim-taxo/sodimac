import { InjectionToken } from '@angular/core';

export interface SincronizacionRepository {
  /* Registra en sod_sincronizacion una carga (CARGA_DESDE_PDA) de un conteo. */
  registrarCarga(eventoId: number, pdaId: number, registrosProcesados: number): Promise<void>;
}

export const SINCRONIZACION_REPOSITORY_TOKEN = new InjectionToken<SincronizacionRepository>('SincronizacionRepository');
