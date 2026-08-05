import { InjectionToken } from '@angular/core';
import { Muestra } from '../models/muestra.model';

/* `codigoMuestra` es la clave del backend y la identidad de la muestra. */
export interface MuestraParaGuardar {
  codigoMuestra: string;
  eventoId: number;
  sucursalId: number;
  nombre: string | null;
}

export interface MuestraRepository {
  /*
   * La muestra del evento. Hoy hay una sola: sod_muestra no distingue rondas, así
   * que un reconteo se valida contra esta misma muestra.
   */
  getByEvento(eventoId: number): Promise<Muestra | null>;

  /* Crea la muestra del evento si todavía no existe; devuelve su id local. */
  asegurarMuestra(muestra: MuestraParaGuardar): Promise<number>;
}

export const MUESTRA_REPOSITORY_TOKEN = new InjectionToken<MuestraRepository>('MuestraRepository');
