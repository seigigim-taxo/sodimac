import { InjectionToken } from '@angular/core';
import { Zona } from '../models/zona.model';

export interface ZonaRepository {
  /*
   * Las zonas pertenecen a la tienda, no al operador: sod_asignacion vincula
   * operador con evento, y dentro de ese evento el operador elige libremente
   * en qué zona trabajar.
   */
  getBySucursal(sucursalId: number): Promise<Zona[]>;
}

export const ZONA_REPOSITORY_TOKEN = new InjectionToken<ZonaRepository>('ZonaRepository');
