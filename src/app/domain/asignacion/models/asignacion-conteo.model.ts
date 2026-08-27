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
  /*
   * La tienda del conteo nuevo, que PUEDE NO SER la que el operador tiene
   * abierta: al SGO se lo asignan por jornada, no por local, y le puede tocar
   * el siguiente en otra tienda.
   *
   * Sin este dato la pantalla recargaba los eventos de la tienda vieja y el
   * conteo recién insertado no aparecía nunca: el aviso lo nombraba y no había
   * ninguna tarjeta que seleccionar.
   */
  sucursalId:      number;
  nombre:          string;
  fechaProgramada: string;
}
