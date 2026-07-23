import { InjectionToken } from '@angular/core';
import { Zona } from '../models/zona.model';

export interface ZonaRepository {
  getByEventoAndOperador(eventoId: number, operadorId: number): Promise<Zona[]>;
}

export const ZONA_REPOSITORY_TOKEN = new InjectionToken<ZonaRepository>('ZonaRepository');
