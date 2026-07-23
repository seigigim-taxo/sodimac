import { InjectionToken } from '@angular/core';
import { OperadorCacheado } from '../models/operador-cacheado.model';

export interface OperadorRepository {
  guardar(operador: OperadorCacheado): Promise<number>;
  obtenerPorRut(rut: number, rutDv: string): Promise<OperadorCacheado | null>;
}

export const OPERADOR_REPOSITORY_TOKEN = new InjectionToken<OperadorRepository>('OperadorRepository');
