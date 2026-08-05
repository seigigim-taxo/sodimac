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
  asegurarEvento(evento: EventoParaGuardar): Promise<number>;
}

export const EVENTO_REPOSITORY_TOKEN = new InjectionToken<EventoRepository>('EventoRepository');
