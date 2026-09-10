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
 * SOLO SE AGREGA. Quitar unidades no deshace una captura anterior: agrega un
 * movimiento negativo. Así un escaneo sigue constando aunque después se haya
 * retractado — mutar el historial para que el saldo quede prolijo perdería
 * justo el dato por el que esto existe.
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
