/*
 * Cómo entró un código a la app.
 *
 *  - 'ESCANER' → lo disparó la pistola.
 *  - 'MANUAL'  → lo tipeó el operador.
 *
 * Describe la entrada del CÓDIGO, no cómo se contaron las unidades. En el modo
 * "por cantidad" el SKU puede llegar por pistola y la cantidad tipearse a mano:
 * esa lectura es 'ESCANER', porque el código lo leyó el lector. La distinción
 * importa porque el reporte del SGO la usa para no mostrar el EAN cuando el SKU
 * se ingresó a mano, ni al revés.
 */
export type MedioCaptura = 'ESCANER' | 'MANUAL';
