import { CodigoErrorZonificacion } from '../../domain/zonificacion/models/error-zonificacion.model';
import { MotivoLocal } from '../../domain/zonificacion/utils/mensajes-zonificacion.utils';

export type { MotivoLocal };

/*
 * Resultado de una acción del operador. `ok` significa "quedó registrada en el
 * teléfono y sale hacia el servidor": no que el servidor ya la aplicó (eso puede
 * tardar o esperar la señal).
 */
export type ResultadoAccion =
  | { ok: true; cantidad?: number; advertencia?: boolean }
  | { ok: false; codigo: CodigoErrorZonificacion | MotivoLocal; data: Record<string, unknown> };

export const rechazo = (codigo: CodigoErrorZonificacion | MotivoLocal, data: Record<string, unknown> = {}): ResultadoAccion => ({
  ok: false,
  codigo,
  data,
});

/* La agenda sobre la que se actúa: el número y el id van en toda petición al WS. */
export interface AgendaRef {
  idAgenda: number;
  numeroAgenda: string;
}
