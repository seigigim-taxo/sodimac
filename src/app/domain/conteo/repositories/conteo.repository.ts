import { InjectionToken } from '@angular/core';
import { ConteoItem } from '../models/conteo-item.model';
import { ConteoResumen } from '../models/conteo-resumen.model';
import { EstadoConteo } from '../models/estado-conteo.model';

export interface ConteoRepository {
  /*
   * upsert opera solo sobre filas EN_CURSO (los scans pertenecen a la sesión
   * de trabajo). adjust / delete reciben el estado: la sesión de conteo pasa
   * 'EN_CURSO' y el detalle de un conteo cerrado pasa 'FINALIZADO'.
   * Un conteo SINCRONIZADO es inmutable — la UI no ofrece acciones sobre él.
   */
  upsert(eventoId: number, ubicacionId: number, productoId: number, operadorId: number, pdaId: number, cantidad: number): Promise<ConteoItem>;
  adjust(eventoId: number, ubicacionId: number, productoId: number, operadorId: number, pdaId: number, delta: number, estado: EstadoConteo): Promise<ConteoItem>;
  delete(eventoId: number, ubicacionId: number, productoId: number, operadorId: number, pdaId: number, estado: EstadoConteo): Promise<void>;

  /* Items de un conteo en un estado dado (EN_CURSO para la sesión de trabajo). */
  getBySesion(eventoId: number, ubicacionId: number, operadorId: number, pdaId: number, estado: EstadoConteo): Promise<ConteoItem[]>;

  /* Cierra la sesión: EN_CURSO → FINALIZADO para toda la tupla. */
  finalizarSesion(eventoId: number, ubicacionId: number, operadorId: number, pdaId: number): Promise<void>;

  /* Confirma la sincronización: FINALIZADO → SINCRONIZADO para toda la tupla. */
  marcarSincronizado(eventoId: number, ubicacionId: number, operadorId: number, pdaId: number): Promise<void>;

  /* Conteos agrupados del operador en esta PDA, con totales y estado. */
  getResumenes(operadorId: number, pdaId: number): Promise<ConteoResumen[]>;

  /* Elimina todas las filas del conteo identificado por la tupla + estado. */
  deleteSesion(eventoId: number, ubicacionId: number, operadorId: number, pdaId: number, estado: EstadoConteo): Promise<void>;
}

export const CONTEO_REPOSITORY_TOKEN = new InjectionToken<ConteoRepository>('ConteoRepository');
