import { InjectionToken } from '@angular/core';
import { DatosPreparacion, PreparacionRequest } from '../models/preparacion.model';

/*
 * PUERTO — descarga inicial que deja al dispositivo listo para trabajar.
 * Hoy devuelve solo el perfil del operador; las sucursales, agendas y muestras
 * se van a sumar a este mismo puerto a medida que el backend las publique.
 */
export interface PreparacionApiRepository {
  preparar(request: PreparacionRequest): Promise<DatosPreparacion>;
}

export const PREPARACION_API_REPOSITORY_TOKEN =
  new InjectionToken<PreparacionApiRepository>('PreparacionApiRepository');
