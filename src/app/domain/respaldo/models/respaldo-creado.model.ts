/*
 * Resultado de un respaldo que ya quedó escrito en disco. `carpeta` y `archivo`
 * van separados porque el modal los muestra distinto: la carpeta es la ruta
 * larga que el operador necesita para encontrarlo desde el PC, el archivo es lo
 * que tiene que buscar ahí adentro.
 */
export interface RespaldoCreado {
  archivo: string;
  carpeta: string;
  bytes:   number;
  fecha:   Date;
}
