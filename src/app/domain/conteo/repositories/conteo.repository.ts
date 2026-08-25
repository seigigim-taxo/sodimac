import { InjectionToken } from '@angular/core';
import { Conteo } from '../models/conteo.model';
import { ConteoItem } from '../models/conteo-item.model';
import { ConteoResumen } from '../models/conteo-resumen.model';
import { SesionTrabajoEnCurso } from '../models/sesion-trabajo.model';
import { ConteoTrazabilidadItem } from '../models/conteo-trazabilidad-item.model';
import { EstadoConteo } from '../models/estado-conteo.model';
import { BusquedaSkuResultado } from '../models/busqueda-sku.model';
import { MedioCaptura } from '../models/medio-captura.model';
import { ConteoLectura } from '../models/conteo-lectura.model';
import { TagFinalizadoPayload } from '../../sincronizacion/models/tag-finalizado.model';

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
  upsert(conteoId: number, ubicacionId: number, productoId: number, operadorId: number, pdaId: number, cantidad: number, codigoLectura: string, medioCaptura: MedioCaptura): Promise<ConteoItem>;
  adjust(conteoId: number, ubicacionId: number, productoId: number, operadorId: number, pdaId: number, delta: number, estado: EstadoConteo): Promise<ConteoItem>;
  delete(conteoId: number, ubicacionId: number, productoId: number, operadorId: number, pdaId: number, estado: EstadoConteo): Promise<void>;

  /*
   * Capturas de una línea, en orden. Una fila por lectura: sirve para saber
   * cuántas unidades entraron por pistola y cuántas a mano, que es lo que el
   * agregado no puede reconstruir.
   */
  getLecturas(detalleId: number): Promise<ConteoLectura[]>;

  /* Líneas de una sesión de TAG en un estado dado. */
  getBySesion(conteoId: number, ubicacionId: number, operadorId: number, pdaId: number, estado: EstadoConteo): Promise<ConteoItem[]>;

  /*
   * Cierra el TAG: EN_CURSO → FINALIZADO para lo que contó ESE operador en esa
   * ubicación. No cierra lo de otros operadores en el mismo TAG — cada uno
   * responde por lo suyo.
   */
  cerrarTag(conteoId: number, ubicacionId: number, operadorId: number): Promise<void>;

  /*
   * Reabre el TAG: FINALIZADO → EN_CURSO. Es el inverso de cerrarTag, para
   * seguir contando un TAG que se cerró antes de tiempo.
   *
   * Devolver las líneas a EN_CURSO no es un detalle de estado: es lo que hace
   * que la sesión se recupere al entrar a la pantalla y que upsert vuelva a
   * encontrar sus filas. Sin eso, reescanear un SKU ya contado chocaría con el
   * UNIQUE de la tabla, que no distingue por estado.
   *
   * Lleva pdaId, a diferencia de cerrarTag: reabrir habilita a escribir, y esa
   * puerta se abre solo para la PDA que hizo el trabajo.
   */
  reabrirTag(conteoId: number, ubicacionId: number, operadorId: number, pdaId: number): Promise<void>;

  /* Confirma la sincronización: FINALIZADO → SINCRONIZADO para toda la tupla. */
  marcarSincronizado(conteoId: number, ubicacionId: number, operadorId: number, pdaId: number): Promise<void>;

  /* Elimina todas las líneas de la sesión identificada por la tupla + estado. */
  deleteSesion(conteoId: number, ubicacionId: number, operadorId: number, pdaId: number, estado: EstadoConteo): Promise<void>;

  /* Sesiones de TAG del operador en esta PDA, con totales y estado. */
  getResumenes(operadorId: number, pdaId: number): Promise<ConteoResumen[]>;

  /*
   * La sesión de TAG que quedó abierta (líneas EN_CURSO) para ese operador en
   * esta PDA, con todo lo necesario para volver a ella: evento, zona, TAG y
   * ubicación. La más reciente si hubiera más de una.
   *
   * Es la fuente para rehidratar el estado en memoria después de un reinicio:
   * getResumenes no sirve porque no trae zona_id ni la ubicación precisa.
   */
  getSesionEnCurso(operadorId: number, pdaId: number): Promise<SesionTrabajoEnCurso | null>;

  /*
   * Evento del último trabajo del operador en esta PDA, sin importar el estado
   * de las líneas. Complementa a getSesionEnCurso, que solo ve EN_CURSO: un TAG
   * ya finalizado no deja sesión que restaurar, pero sí dice en qué evento
   * estaba trabajando el operador.
   */
  getEventoIdUltimoTrabajo(operadorId: number, pdaId: number): Promise<number | null>;

  // ─────────── consultas por evento (cruzan todas las rondas) ───────────

  /*
   * SKUs distintos con al menos una línea en el evento (en cualquier ubicación,
   * EN_CURSO o FINALIZADO) — para calcular faltantes contra la muestra completa
   * al cerrar el conteo del evento.
   */
  getSkusContadosPorEvento(eventoId: number, operadorId: number, pdaId: number): Promise<string[]>;

  getUnidadesContadasPorEvento(eventoId: number, operadorId: number, pdaId: number): Promise<number>;

  /*
   * En qué TAG(s)/zona(s) hay líneas para ese SKU — un SKU puede estar en
   * varios TAG. No se filtra por operador ni por PDA: la pregunta es "¿dónde se
   * contó esto?", y una PDA se pasa entre turnos, así que acotarla al operador
   * actual escondería conteos que sí están en esta base.
   *
   * `eventoId` es opcional a propósito: sin evento seleccionado —recién
   * terminado un conteo, antes de tomar el siguiente— la pregunta sigue siendo
   * válida y se responde sobre todo lo contado en la PDA.
   */
  buscarPorSku(sku: string, eventoId?: number): Promise<BusquedaSkuResultado[]>;

  /*
   * TAGs únicos ya contados en rondas anteriores a `iteracion`. Sirve en
   * reconteo para sugerir al operador dónde contó antes, sin obligarlo a
   * repetir los mismos TAGs.
   */
  getTagsContadosEnRondasAnteriores(eventoId: number, iteracion: number): Promise<string[]>;

  // ─────────── trazabilidad (lectura pura) ───────────

  /*
   * Detalle línea a línea de todo lo contado en el evento, separado por
   * iteración. stock_sistema viene de sod_muestra_detalle de la misma
   * iteración del conteo. Solo lectura — no modifica estados.
   */
  getTrazabilidadEvento(eventoId: number, operadorId: number, pdaId: number): Promise<ConteoTrazabilidadItem[]>;

  // ─────────── sincronización TAG ───────────

  /*
   * Genera y persiste un carga_uid para la sesión TAG identificada por
   * conteoId + ubicacionId + operadorId + pdaId. Si ya existe uno, lo reutiliza.
   */
  asegurarCargaUid(conteoId: number, ubicacionId: number, operadorId: number, pdaId: number): Promise<string>;

  /*
   * Arma el payload completo para enviar a tag-finalizado.php a partir de un
   * ConteoResumen. Consulta las tablas locales para resolver sucursal, evento,
   * ubicación, zona, operador, PDA y detalles con stock_sistema.
   */
  getPayloadSincronizacion(conteo: ConteoResumen): Promise<TagFinalizadoPayload>;
}

export const CONTEO_REPOSITORY_TOKEN = new InjectionToken<ConteoRepository>('ConteoRepository');
