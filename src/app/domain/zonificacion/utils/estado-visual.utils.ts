import { ResumenZonificacion } from '../models/estado-agenda.model';
import { EstadoZonificacion } from '../models/estado-zonificacion.model';

/*
 * Cómo se le presenta al operador el estado de una agenda. Son los cuatro
 * estados que muestra el SGO más "sin zonificar":
 *
 *   SIN_ZONIFICAR        la agenda no tiene cabecera ni rangos.
 *   BORRADOR             hay rangos y todavía se puede editar.
 *   PENDIENTE_EN_CONTEO  borrador, pero el conteo ya va adelante: hay TAG
 *                        capturados (el avance del conteo no se ve completo
 *                        hasta zonificar y confirmar).
 *   REQUIERE_AJUSTE      borrador con algo que corregir antes de confirmar:
 *                        rangos desbalanceados o TAG usados fuera de todo rango.
 *   CONFIRMADA           cerrada; para editar hay que reabrirla.
 *
 * Es una regla de presentación, no de negocio: no cambia lo que el servidor
 * acepta. Vive en el dominio para probarla sin Angular.
 */
export type EstadoVisual = 'SIN_ZONIFICAR' | 'BORRADOR' | 'PENDIENTE_EN_CONTEO' | 'REQUIERE_AJUSTE' | 'CONFIRMADA';

export type TonoEstado = 'neutro' | 'aviso' | 'ok' | 'error';

export const ETIQUETA_ESTADO_VISUAL: Record<EstadoVisual, string> = {
  SIN_ZONIFICAR: 'Sin zonificar',
  BORRADOR: 'Borrador',
  PENDIENTE_EN_CONTEO: 'Pendiente en conteo',
  REQUIERE_AJUSTE: 'Requiere ajuste',
  CONFIRMADA: 'Confirmada',
};

export const TONO_ESTADO_VISUAL: Record<EstadoVisual, TonoEstado> = {
  SIN_ZONIFICAR: 'neutro',
  BORRADOR: 'neutro',
  PENDIENTE_EN_CONTEO: 'aviso',
  REQUIERE_AJUSTE: 'error',
  CONFIRMADA: 'ok',
};

/* Para la lista de agendas, que solo trae el estado y cuántos TAG ya se capturaron. */
export function estadoVisualDeLista(estado: EstadoZonificacion, tagsCapturados: number): EstadoVisual {
  if (estado === 'CONFIRMADA') return 'CONFIRMADA';
  if (estado === 'SIN_ZONIFICACION') return 'SIN_ZONIFICAR';
  return tagsCapturados > 0 ? 'PENDIENTE_EN_CONTEO' : 'BORRADOR';
}

/*
 * Para el resumen de una agenda, que sabe más: cuántos TAG usa el conteo,
 * si hay rangos desbalanceados y cuántos TAG usados quedaron fuera.
 */
export function estadoVisualDeResumen(
  estado: EstadoZonificacion,
  resumen: Pick<ResumenZonificacion, 'tagsUsados' | 'desbalance'> | null,
  tagsFueraTotal: number,
  hayRangos: boolean,
): EstadoVisual {
  if (estado === 'CONFIRMADA') return 'CONFIRMADA';
  if (estado === 'SIN_ZONIFICACION' && !hayRangos) return 'SIN_ZONIFICAR';
  if (resumen?.desbalance || tagsFueraTotal > 0) return 'REQUIERE_AJUSTE';
  if ((resumen?.tagsUsados ?? 0) > 0) return 'PENDIENTE_EN_CONTEO';
  return 'BORRADOR';
}
