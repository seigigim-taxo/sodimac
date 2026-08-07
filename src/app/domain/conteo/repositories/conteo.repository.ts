import { InjectionToken } from '@angular/core';
import { Conteo } from '../models/conteo.model';
import { ConteoItem } from '../models/conteo-item.model';
import { ConteoResumen } from '../models/conteo-resumen.model';
import { EstadoConteo } from '../models/estado-conteo.model';
import { BusquedaSkuResultado } from '../models/busqueda-sku.model';

export interface ConteoRepository {
  // ─────────────────────────── la ronda ───────────────────────────

  /*
   * Abre la ronda `iteracion` del evento y devuelve su registro. Idempotente:
   * llamarla dos veces con el mismo número no duplica (UNIQUE evento+iteracion).
   *
   * Se llama al ABRIR la iteración, no al primer escaneo. Esa es la razón de ser
   * de la tabla: una ronda existe porque alguien la abrió, no porque alguien contó.
   */
  abrirRonda(eventoId: number, iteracion: number): Promise<Conteo>;

  /* Ronda en curso del evento, o null si no hay ninguna abierta. */
  getRondaAbierta(eventoId: number): Promise<Conteo | null>;

  /*
   * Última ronda registrada, esté abierta o cerrada. Un evento EN_ANALISIS no
   * tiene ronda abierta, así que es la única forma de saber en qué número va
   * antes de abrir la siguiente.
   */
  getUltimaRonda(eventoId: number): Promise<Conteo | null>;

  /* ABIERTO → FINALIZADO. A partir de acá sus líneas dejan de ser editables. */
  cerrarRonda(conteoId: number): Promise<void>;

  // ────────────────────────── las líneas ──────────────────────────

  /*
   * upsert opera solo sobre líneas EN_CURSO (los scans pertenecen a la sesión
   * de trabajo). adjust / delete reciben el estado: la sesión de conteo pasa
   * 'EN_CURSO' y el detalle de una sesión cerrada pasa 'FINALIZADO'.
   * Una línea SINCRONIZADA es inmutable — la UI no ofrece acciones sobre ella.
   *
   * Ya no hace falta validar la iteración: una línea cuelga de un conteoId, y
   * ese conteo está abierto o no. Lo que antes comparaba contra MAX() ahora es
   * una propiedad de la fila padre.
   */
  upsert(conteoId: number, ubicacionId: number, productoId: number, operadorId: number, pdaId: number, cantidad: number): Promise<ConteoItem>;
  adjust(conteoId: number, ubicacionId: number, productoId: number, operadorId: number, pdaId: number, delta: number, estado: EstadoConteo): Promise<ConteoItem>;
  delete(conteoId: number, ubicacionId: number, productoId: number, operadorId: number, pdaId: number, estado: EstadoConteo): Promise<void>;

  /* Líneas de una sesión de TAG en un estado dado. */
  getBySesion(conteoId: number, ubicacionId: number, operadorId: number, pdaId: number, estado: EstadoConteo): Promise<ConteoItem[]>;

  /*
   * Cierra el TAG: EN_CURSO → FINALIZADO para lo que contó ESE operador en esa
   * ubicación. No cierra lo de otros operadores en el mismo TAG — cada uno
   * responde por lo suyo.
   */
  cerrarTag(conteoId: number, ubicacionId: number, operadorId: number): Promise<void>;

  /* Confirma la sincronización: FINALIZADO → SINCRONIZADO para toda la tupla. */
  marcarSincronizado(conteoId: number, ubicacionId: number, operadorId: number, pdaId: number): Promise<void>;

  /* Elimina todas las líneas de la sesión identificada por la tupla + estado. */
  deleteSesion(conteoId: number, ubicacionId: number, operadorId: number, pdaId: number, estado: EstadoConteo): Promise<void>;

  /* Sesiones de TAG del operador en esta PDA, con totales y estado. */
  getResumenes(operadorId: number, pdaId: number): Promise<ConteoResumen[]>;

  // ─────────── consultas por evento (cruzan todas las rondas) ───────────

  /*
   * SKUs distintos con al menos una línea en el evento (en cualquier ubicación,
   * EN_CURSO o FINALIZADO) — para calcular faltantes contra la muestra completa
   * al cerrar el conteo del evento.
   */
  getSkusContadosPorEvento(eventoId: number, operadorId: number, pdaId: number): Promise<string[]>;

  getUnidadesContadasPorEvento(eventoId: number, operadorId: number, pdaId: number): Promise<number>;

  /*
   * En qué TAG(s)/zona(s) hay líneas para ese SKU — un SKU puede estar en varios
   * TAG. Cubre TODAS las rondas de la jornada, no solo la del evento recibido:
   * cada reconteo crea su propio evento, y la pregunta del operador ("¿dónde
   * conté esto?") apunta casi siempre a una ronda anterior.
   *
   * No se filtra por operador ni por PDA: una PDA se pasa entre turnos, así que
   * acotarla al operador actual escondería conteos que sí están en esta base.
   */
  buscarPorSku(eventoId: number, sku: string): Promise<BusquedaSkuResultado[]>;

  /*
   * TAGs únicos ya contados en rondas anteriores a `iteracion`. Sirve en
   * reconteo para sugerir al operador dónde contó antes, sin obligarlo a
   * repetir los mismos TAGs.
   */
  getTagsContadosEnRondasAnteriores(eventoId: number, iteracion: number): Promise<string[]>;
}

export const CONTEO_REPOSITORY_TOKEN = new InjectionToken<ConteoRepository>('ConteoRepository');
