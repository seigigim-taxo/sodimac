import { InjectionToken } from '@angular/core';
import { Evento } from '../models/evento.model';

/*
 * sod_evento_inventario no tiene clave natural propia, así que la identidad
 * práctica de un evento es su tienda + su fecha programada. Cuando el backend
 * defina un código de evento, esto pasa a ser un upsert por ese código.
 */
export interface EventoParaGuardar {
  sucursalId: number;
  fechaProgramada: string;
  estado: Evento['estado'];
  nombre: string;
}

export interface EventoRepository {
  getBySucursal(sucursalId: number): Promise<Evento[]>;
  getById(id: number): Promise<Evento | null>;
  updateEstado(id: number, estado: Evento['estado']): Promise<void>;

  /* Crea el evento si no existe para esa tienda y fecha; devuelve su id local. */
  /*
   * Reutiliza el evento de (sucursal, fecha) si ya existe. Solo sirve cuando la
   * preparación no trae muestra: con muestra, la identidad es su código y la
   * resuelve el caso de uso — dos operadores en la misma tienda y el mismo día
   * reciben asignaciones distintas y cada una necesita su propio evento.
   */
  asegurarEvento(evento: EventoParaGuardar): Promise<number>;

  /* Crea un evento nuevo siempre, sin buscar uno previo que reutilizar. */
  crearEvento(evento: EventoParaGuardar): Promise<number>;
}

export const EVENTO_REPOSITORY_TOKEN = new InjectionToken<EventoRepository>('EventoRepository');
