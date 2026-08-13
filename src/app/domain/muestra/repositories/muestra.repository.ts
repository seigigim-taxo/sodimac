import { InjectionToken } from '@angular/core';
import { Muestra } from '../models/muestra.model';

/* `codigoMuestra` es la clave del backend y la identidad de la muestra. */
export interface MuestraParaGuardar {
  codigoMuestra: string;
  eventoId: number;
  sucursalId: number;
  nombre: string | null;
  iteracion?: number;
  estado?: string;
  idAgenda?: number | null;
  numeroAgenda?: string | null;
}

export interface MuestraRepository {
  /*
   * Muestra de iteración 1 de un evento. Compatibilidad temporal hasta que
   * LoadMuestraSetUseCase se ajuste para recibir iteración explícita.
   */
  getByEvento(eventoId: number): Promise<Muestra | null>;

  /* Muestra de una iteración específica. */
  getByEventoIteracion(eventoId: number, iteracion: number): Promise<Muestra | null>;

  /* Crea la muestra si no existe para (evento, iteración); devuelve su id local. */
  asegurarMuestra(muestra: MuestraParaGuardar): Promise<number>;
}

export const MUESTRA_REPOSITORY_TOKEN = new InjectionToken<MuestraRepository>('MuestraRepository');
