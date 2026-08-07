import { InjectionToken } from '@angular/core';

export interface SgoSyncResult {
  success: boolean;
  mensaje?: string;
  datosEnviados?: number;
}

export interface AnalisisSgoResponse {
  requiereReconteo: boolean;
  iteracion?: number;
  skusARecontar?: number;
}

export interface SgoSyncRepository {
  sincronizarConteo(eventoId: number, datosConteo: unknown): Promise<SgoSyncResult>;
  obtenerAnalisisReconteo(eventoId: number, iteracionActual: number): Promise<AnalisisSgoResponse>;
}

export const SGO_SYNC_REPOSITORY_TOKEN = new InjectionToken<SgoSyncRepository>('SgoSyncRepository');
