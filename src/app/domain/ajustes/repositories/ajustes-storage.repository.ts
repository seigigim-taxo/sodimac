import { InjectionToken } from '@angular/core';

/*
 * Ajustes de operación de la PDA: preferencias del equipo, no del negocio.
 *
 * `null` en la lectura significa "nunca se tocó", para que cada ajuste decida
 * su propio valor por defecto en vez de que lo imponga el almacenamiento.
 */
export interface AjustesStorageRepository {
  cargarSincronizacionAutomatica(): Promise<boolean | null>;
  guardarSincronizacionAutomatica(activa: boolean): Promise<void>;
}

export const AJUSTES_STORAGE_REPOSITORY_TOKEN =
  new InjectionToken<AjustesStorageRepository>('AjustesStorageRepository');
