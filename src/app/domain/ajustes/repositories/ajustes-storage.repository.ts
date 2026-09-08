import { InjectionToken } from '@angular/core';
import { ModoCaptura } from '../../conteo/models/modo-captura.model';

/*
 * Ajustes de operación de la PDA: preferencias del equipo, no del negocio.
 *
 * `null` en la lectura significa "nunca se tocó", para que cada ajuste decida
 * su propio valor por defecto en vez de que lo imponga el almacenamiento.
 */
export interface AjustesStorageRepository {
  cargarSincronizacionAutomatica(): Promise<boolean | null>;
  guardarSincronizacionAutomatica(activa: boolean): Promise<void>;

  /*
   * Con qué modo cae cada TAG nuevo, hasta que el operador lo cambie. Vive acá
   * y no como signal suelto en CountingPageComponent porque ese componente se
   * destruye y se vuelve a crear en cada TAG —se navega a /counting-tag y de
   * vuelta a /counting—, así que un signal local pierde el valor justo en el
   * momento en que se supone que tiene que mantenerlo.
   */
  cargarModoCapturaPreferido(): Promise<ModoCaptura | null>;
  guardarModoCapturaPreferido(modo: ModoCaptura): Promise<void>;
}

export const AJUSTES_STORAGE_REPOSITORY_TOKEN =
  new InjectionToken<AjustesStorageRepository>('AjustesStorageRepository');
