import { InjectionToken } from '@angular/core';

/*
 * Persiste QUÉ evento eligió el operador, no el evento en sí: el objeto se
 * relee siempre de SQLite para que el estado (ABIERTO / EN_ANALISIS / CERRADO)
 * no quede congelado en una copia vieja.
 *
 * Existe porque la selección vivía solo en un signal en memoria: al reiniciar
 * la PDA se perdía, y los guards de conteo quedaban sin evento mientras la base
 * seguía teniendo un conteo EN_CURSO — combinación que producía un ciclo de
 * redirecciones entre /home, /counting y /counting-tag.
 */
export interface EventoSeleccionadoStorageRepository {
  guardar(eventoId: number): Promise<void>;
  obtener(): Promise<number | null>;
  limpiar(): Promise<void>;
}

export const EVENTO_SELECCIONADO_STORAGE_TOKEN =
  new InjectionToken<EventoSeleccionadoStorageRepository>('EventoSeleccionadoStorageRepository');
