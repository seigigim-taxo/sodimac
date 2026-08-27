import { Injectable, inject, isDevMode } from '@angular/core';
import { ApiService } from '../../core/http/api.service';
import { environment } from '../../../environments/environment';
import { AsignacionApiRepository } from '../../domain/asignacion/repositories/asignacion-api.repository';
import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';

/*
 * Le pregunta al SGO si hay un conteo nuevo para esta tienda.
 *
 * CONTRATO ESPERADO — pendiente de que el backend lo exponga.
 *
 *   GET  <apiUrl>/asignaciones/nuevo-conteo.php
 *        ?sucursal_id=4088
 *        &evento_finalizado_id=12      (se omite si no hay ninguno terminado)
 *
 * Con trabajo asignado:
 *
 *   { "status": "OK", "data": { "evento_id": 13,
 *                               "nombre": "RADIOS",
 *                               "fecha_programada": "2026-08-27" } }
 *
 * Sin trabajo — que es un resultado normal, no un error:
 *
 *   { "status": "OK", "data": null }
 *
 * ApiService.unwrap ya desenvuelve `data`, así que acá llega el objeto de
 * adentro, o null.
 *
 * La consulta es deliberadamente liviana: solo dice SI hay algo nuevo y cuál
 * es. Los datos completos —muestra, productos, zonas— los baja después la
 * preparación. Pedirlo todo de una para descubrir que no había nada nuevo es
 * lo que se quiso evitar.
 */

const ENDPOINT_POR_DEFECTO = 'asignaciones/nuevo-conteo.php';

/*
 * Más corto que el default de 30 s a propósito: el operador toca este botón
 * esperando una respuesta inmediata, y si el SGO no contesta pronto prefiere
 * enterarse y reintentar antes que mirar un spinner.
 */
const TIMEOUT_MS = 15_000;

@Injectable({ providedIn: 'root' })
export class AsignacionApiService implements AsignacionApiRepository {
  private api = inject(ApiService);

  async consultarNuevaAsignacion(
    sucursalId: number,
    eventoFinalizadoId: number | null,
  ): Promise<AsignacionConteo | null> {
    const endpoint = environment.asignacionEndpoint ?? ENDPOINT_POR_DEFECTO;

    const params: Record<string, string | number> = { sucursal_id: sucursalId };
    // Se omite en vez de mandar null: un query string con "null" obliga al PHP
    // a distinguir el texto del valor ausente, y eso siempre sale mal.
    if (eventoFinalizadoId !== null) {
      params['evento_finalizado_id'] = eventoFinalizadoId;
    }

    const crudo = await this.api.get<unknown>(endpoint, params, { timeoutMs: TIMEOUT_MS });
    const asignacion = parsearAsignacion(crudo);

    if (isDevMode()) {
      console.log('[AsignacionApi]', { sucursalId, eventoFinalizadoId, asignacion });
    }
    return asignacion;
  }
}

/*
 * El `unknown` de arriba es deliberado: castear la respuesta a una interfaz no
 * valida nada en tiempo de ejecución. Quien decide si el JSON sirve es esto.
 *
 * Ante cualquier forma que no reconozca devuelve null —"no hay nada asignado"—
 * en vez de lanzar. Un contrato inesperado no debería dejar al operador con un
 * error rojo cuando el resultado normal de esta consulta es justamente "todavía
 * no hay trabajo".
 */
export function parsearAsignacion(crudo: unknown): AsignacionConteo | null {
  if (crudo === null || crudo === undefined) return null;
  if (typeof crudo !== 'object' || Array.isArray(crudo)) return null;

  const obj = crudo as Record<string, unknown>;

  // Se aceptan las dos convenciones: snake_case del PHP y camelCase por si el
  // endpoint termina normalizando la salida.
  const eventoId = Number(obj['evento_id'] ?? obj['eventoId']);
  if (!Number.isInteger(eventoId) || eventoId <= 0) return null;

  const nombre = obj['nombre'];
  const fecha  = obj['fecha_programada'] ?? obj['fechaProgramada'];

  return {
    eventoId,
    nombre:          typeof nombre === 'string' && nombre.trim() !== '' ? nombre : `Conteo ${eventoId}`,
    // Sin fecha no se puede ubicar el evento en el día; se deja vacío y Home
    // lo filtra, que es preferible a inventar una.
    fechaProgramada: typeof fecha === 'string' ? fecha.slice(0, 10) : '',
  };
}
