import { InjectionToken } from '@angular/core';
import { Sucursal } from '../models/sucursal.model';

export interface SucursalRepository {
  getByUsuario(userId: number): Promise<Sucursal[]>;
}

export const SUCURSAL_REPOSITORY_TOKEN = new InjectionToken<SucursalRepository>('SucursalRepository');
