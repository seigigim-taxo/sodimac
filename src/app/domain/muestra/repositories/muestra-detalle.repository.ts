import { InjectionToken } from '@angular/core';
import { MuestraDetalle } from '../models/muestra-detalle.model';

export interface MuestraDetalleRepository {
  getByMuestra(muestraId: number): Promise<MuestraDetalle[]>;
}

export const MUESTRA_DETALLE_REPOSITORY_TOKEN = new InjectionToken<MuestraDetalleRepository>('MuestraDetalleRepository');
