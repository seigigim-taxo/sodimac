import { InjectionToken } from '@angular/core';
import { Zona } from '../models/zona.model';

export interface ZonaParaGuardar {
  codigo: string;
  nombre: string | null;
  zonaTipoId: number;
}

export interface ZonaRepository {
  /*
   * Las zonas pertenecen a la tienda, no al operador: sod_asignacion vincula
   * operador con evento, y dentro de ese evento el operador elige libremente
   * en qué zona trabajar.
   */
  getBySucursal(sucursalId: number): Promise<Zona[]>;

  /*
   * Reemplaza las zonas de la sucursal: borra las existentes e inserta las
   * nuevas. Así una zona quitada del backend desaparece también acá.
   */
  reemplazarDeSucursal(sucursalId: number, zonas: ZonaParaGuardar[]): Promise<void>;
}

export const ZONA_REPOSITORY_TOKEN = new InjectionToken<ZonaRepository>('ZonaRepository');
