import { InjectionToken } from '@angular/core';

export interface UbicacionRepository {
  insert(zonaId: number, tag: string): Promise<number>;
}

export const UBICACION_REPOSITORY_TOKEN = new InjectionToken<UbicacionRepository>('UbicacionRepository');
