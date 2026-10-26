import { CodigoErrorZonificacion } from '../../domain/zonificacion/models/error-zonificacion.model';

/*
 * Motivos por los que la app misma no deja hacer algo, antes de preguntarle al
 * servidor. Los demás rechazos usan los códigos del contrato v1 (las mismas
 * reglas que aplica el WS), para que la pantalla tenga un solo mensaje por caso.
 */
export type MotivoLocal =
  | 'SIN_SESION' /* no hay operador o PDA identificados */
  | 'SIN_CATALOGO' /* nunca se descargó el catálogo de zonas */
  | 'SIN_ESTADO' /* la agenda nunca se descargó: abrirla con red al menos una vez */
  | 'AGENDA_SOLO_LECTURA' /* el operador no puede modificar esta agenda */
  | 'RANGO_EN_ENVIO'; /* el rango se está enviando justo ahora: reintentar en un momento */

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
