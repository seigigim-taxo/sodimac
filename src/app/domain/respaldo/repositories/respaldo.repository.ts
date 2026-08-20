import { InjectionToken } from '@angular/core';
import { RespaldoCreado } from '../models/respaldo-creado.model';

export interface RespaldoRepository {
  /*
   * Genera el .zip con la base local y lo deja escrito en el almacenamiento
   * externo del equipo. Devuelve dónde quedó: sin eso el operador no tiene
   * forma de encontrar el archivo después.
   */
  respaldarBaseLocal(): Promise<RespaldoCreado>;
}

export const RESPALDO_REPOSITORY_TOKEN = new InjectionToken<RespaldoRepository>('RespaldoRepository');
