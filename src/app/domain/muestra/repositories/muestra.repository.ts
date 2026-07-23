import { InjectionToken } from '@angular/core';
import { Muestra } from '../models/muestra.model';

export interface MuestraRepository {
  getByEvento(eventoId: number): Promise<Muestra | null>;
}

export const MUESTRA_REPOSITORY_TOKEN = new InjectionToken<MuestraRepository>('MuestraRepository');
