import { InjectionToken } from '@angular/core';

/*
 * PUERTO — de dónde sale la muestra de una iteración.
 *
 * La iteración 1 es la muestra completa que baja con el evento. Las siguientes
 * son el recorte acotado que backoffice/SGO decide recontar, y ese dato hoy no
 * existe en ninguna parte: no hay endpoint de análisis todavía.
 *
 * Este puerto aísla exactamente esa incógnita. HOY NO TIENE IMPLEMENTACIÓN:
 * el token no está registrado en main.ts, así que abrir una iteración de
 * reconteo falla con NullInjectorError. Es deliberado — se prefiere el fallo
 * visible antes que datos inventados.
 *
 * La implementación definitiva baja la muestra del SGO y la materializa en
 * sod_muestra + sod_muestra_detalle, de modo que el resto de la app —conteo,
 * validaciones, resúmenes— siga leyendo de las tablas reales sin enterarse.
 *
 * Para habilitarlo: registrar un HttpPlanMuestraRepository en main.ts.
 */
export interface PlanMuestraRepository {
  /*
   * Deja lista la muestra de `iteracion` para el evento y devuelve su id.
   * Debe ser idempotente: si esa muestra ya existe, la devuelve sin duplicarla
   * (abrir dos veces la misma ronda no puede generar dos muestras).
   */
  prepararMuestraDeIteracion(eventoId: number, iteracion: number): Promise<number | null>;
}

export const PLAN_MUESTRA_REPOSITORY_TOKEN =
  new InjectionToken<PlanMuestraRepository>('PlanMuestraRepository');
