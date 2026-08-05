import { InjectionToken } from '@angular/core';
import { ConteoItem } from '../models/conteo-item.model';
import { ConteoResumen } from '../models/conteo-resumen.model';
import { EstadoConteo } from '../models/estado-conteo.model';
import { BusquedaSkuResultado } from '../models/busqueda-sku.model';

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

  /*
   * SKUs distintos con al menos una fila en el evento (en cualquier ubicación,
   * EN_CURSO o FINALIZADO) — para calcular faltantes contra la muestra completa
   * al cerrar el conteo del evento.
   */
  getSkusContadosPorEvento(eventoId: number, operadorId: number, pdaId: number): Promise<string[]>;

  /* Elimina todas las filas del conteo identificado por la tupla + estado. */
  deleteSesion(eventoId: number, ubicacionId: number, operadorId: number, pdaId: number, estado: EstadoConteo): Promise<void>;

  /*
   * En qué TAG(s)/zona(s) del evento hay filas registradas para ese SKU — un SKU
   * puede estar en varios TAG. No se filtra por operador ni por PDA: la pregunta
   * es "¿dónde se contó esto?", y una PDA se pasa entre turnos, así que acotarla
   * al operador actual escondería conteos que sí están en esta base.
   */
  buscarPorSku(eventoId: number, sku: string): Promise<BusquedaSkuResultado[]>;

  /*
   * Ronda de conteo del evento: el mayor número registrado en sod_conteo, o 1 si
   * el evento todavía no tiene ninguna fila. Es la única fuente de la iteración —
   * no se guarda en ninguna otra tabla.
   */
  getIteracionActiva(eventoId: number): Promise<number>;

  getUnidadesContadasPorEvento(eventoId: number, operadorId: number, pdaId: number): Promise<number>;

  /*
   * TAGs únicos que ya se contaron en iteraciones anteriores a la activa.
   * Sirve en reconteo para sugerir al operador dónde contó antes, sin
   * obligarlo a repetir los mismos TAGs.
   */
  getTagsContadosEnIteracionesAnteriores(eventoId: number, iteracionActual: number): Promise<string[]>;
}

export const CONTEO_REPOSITORY_TOKEN = new InjectionToken<ConteoRepository>('ConteoRepository');
