import { MedioCaptura } from './medio-captura.model';

/*
 * Una captura: un código entró de una forma y declaró una cantidad.
 *
 * Es un LOG, no un conjunto — cada lectura agrega una fila. Escanear diez veces
 * el mismo EAN deja diez filas, y eso es deliberado: colapsarlas ahorraría unas
 * pocas filas y perdería para siempre cuántas unidades entraron por pistola y
 * cuántas a mano.
 *
 * El SGO recibe menos que esto: su contrato pide solo las combinaciones
 * distintas de (código, medio), sin cantidad ni fecha. Pero el contrato del
 * servidor no es razón para tirar dato en la PDA, así que local se guarda
 * completo y el payload se deriva.
 *
 * SOLO SE AGREGA — con una excepción acotada. Los movimientos del SGO y todo lo
 * ya sincronizado son inmutables: quitar unidades ahí agrega un movimiento
 * negativo, no deshace la captura anterior, para que un escaneo siga constando
 * aunque después se haya retractado.
 *
 * Lo que SÍ se puede corregir es una lectura de la sesión EN_CURSO desde la
 * lista de la pantalla de conteo (+/- y borrado sobre la fila): nada de eso
 * viajó todavía, y la fila nunca se elimina al bajarla —queda en 0—, así que
 * la constancia de "este código se leyó" se mantiene igual.
 *
 * INVARIANTE: la suma de los movimientos de un detalle da su cantidad_fisica.
 * Todo pasa por acá: los scans, los botones +/- y la declaración de cantidad 0
 * (que entra como el negativo del total previo).
 */
export interface ConteoLectura {
  /* Nulo cuando no hubo lectura: los botones +/- mueven unidades sin leer nada. */
  codigoLectura: string | null;
  medioCaptura:  MedioCaptura;
  /* Movimiento sobre el total, con signo. Negativo al quitar unidades. */
  cantidad:      number;
  fechaHora:     string;
}
