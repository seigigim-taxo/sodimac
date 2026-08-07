import { InjectionToken } from '@angular/core';
import { AnalisisIteracion } from '../models/analisis-iteracion.model';

/*
 * PUERTO — el análisis del SGO sobre una ronda terminada.
 *
 * La iteración 1 es la muestra completa que baja con el evento. Las siguientes
 * son el recorte acotado que el SGO decide recontar, y llega junto con la fecha
 * y el estado de un evento NUEVO: cada ronda es su propio registro de evento,
 * así la muestra acotada no pisa la de la ronda anterior y queda el historial.
 *
 * Devuelve datos, no efectos: la implementación no escribe en base. Persistir
 * es de AbrirSiguienteIteracionUseCase. Por eso reemplazar el mock por la
 * llamada HTTP real es cambiar la clase registrada en main.ts y nada más.
 */
export interface PlanMuestraRepository {
  /*
   * El análisis de la ronda `iteracionActual` del evento. Null = el SGO no pide
   * otra ronda: el ciclo terminó.
   */
  obtenerAnalisis(eventoId: number, iteracionActual: number): Promise<AnalisisIteracion | null>;
}

export const PLAN_MUESTRA_REPOSITORY_TOKEN =
  new InjectionToken<PlanMuestraRepository>('PlanMuestraRepository');
