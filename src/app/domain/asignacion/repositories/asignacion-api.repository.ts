import { InjectionToken } from '@angular/core';
import { AsignacionConteo } from '../models/asignacion-conteo.model';

/*
 * Le pregunta al SGO si hay un conteo nuevo para esta PDA.
 *
 * Existe como puerto porque hoy la respuesta está mockeada: el endpoint real
 * todavía no está definido. Cuando llegue, se implementa esta interfaz contra
 * HTTP y no cambia nada aguas arriba — ni el caso de uso, ni la pantalla.
 *
 * `null` significa "el SGO no tiene nada asignado todavía", que es un
 * resultado normal y esperable, no un error: el operador reintenta más tarde.
 */
export interface AsignacionApiRepository {
  consultarNuevaAsignacion(
    sucursalId: number,
    eventoFinalizadoId: number | null,
  ): Promise<AsignacionConteo | null>;
}

export const ASIGNACION_API_REPOSITORY_TOKEN =
  new InjectionToken<AsignacionApiRepository>('AsignacionApiRepository');
