/*
 * Estado de la zonificación de una agenda, tal como lo informa el servidor.
 * SIN_ZONIFICACION no es un valor de la base: es la agenda que todavía no tiene
 * cabecera (el servidor la crea con el primer rango guardado).
 */
export type EstadoZonificacion = 'SIN_ZONIFICACION' | 'BORRADOR' | 'CONFIRMADA';

/* Solo en BORRADOR se guardan y eliminan rangos. Anular TAG no depende del estado. */
export const puedeEditarRangos = (estado: EstadoZonificacion): boolean => estado !== 'CONFIRMADA';
