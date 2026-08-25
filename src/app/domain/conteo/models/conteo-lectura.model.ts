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
 * OJO — no se promete que la suma de las lecturas coincida con
 * cantidad_fisica de la línea. Dos operaciones lo rompen a propósito: el
 * MAX(0, …) que impide negativos, y la regla de que declarar cantidad 0
 * REEMPLAZA el total en vez de sumarse. Para que cuadrara habría que inventar
 * capturas que nunca ocurrieron, y un registro que miente para que cierre la
 * aritmética no sirve como trazabilidad. Acá manda lo que el operador hizo.
 */
export interface ConteoLectura {
  codigoLectura: string;
  medioCaptura:  MedioCaptura;
  cantidad:      number;
  fechaHora:     string;
}
