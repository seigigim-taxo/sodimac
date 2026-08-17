/*
 * Un conteo que el SGO le asigna a esta PDA: el evento sobre el que toca
 * trabajar ahora. Puede ser de otra jornada — un operador que terminó su
 * conteo queda a la espera de que le asignen el siguiente.
 *
 * Es un DTO del borde, no el evento de dominio: lo que llega del SGO
 * identifica el trabajo, y el evento completo se resuelve después contra la
 * base local.
 */
export interface AsignacionConteo {
  eventoId:        number;
  nombre:          string;
  fechaProgramada: string;
}
