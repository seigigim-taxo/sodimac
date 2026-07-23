import { InjectionToken } from '@angular/core';
import { Evento } from '../models/evento.model';

export interface EventoRepository {
  getBySucursal(sucursalId: number): Promise<Evento[]>;
  getById(id: number): Promise<Evento | null>;
}

export const EVENTO_REPOSITORY_TOKEN = new InjectionToken<EventoRepository>('EventoRepository');
