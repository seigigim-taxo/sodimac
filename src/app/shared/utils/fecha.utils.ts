/*
 * Fecha y hora LOCALES de la PDA, en los mismos formatos que ya usaba la app.
 *
 * El formato no cambia — cambia el huso. Hasta acá convivían dos relojes:
 *
 *   - SQLite CURRENT_TIMESTAMP devuelve UTC. En Chile (UTC−4) cada línea de
 *     conteo quedaba registrada 4 horas adelante de la hora real en que se
 *     contó, y el SGO recibía ese valor tal cual porque fecha_hora viaja
 *     verbatim en el payload.
 *   - carga_uid, en cambio, se armaba con new Date() local. O sea que el mismo
 *     registro se contradecía a sí mismo: el identificador decía una hora y el
 *     campo de fecha decía otra.
 *
 *   - Y toISOString() (UTC) para comparar "hoy" hacía que desde las 20:00 hora
 *     Chile la PDA ya estuviera en el día siguiente, dejando el evento del día
 *     como vencido durante las últimas 4 horas del turno.
 *
 * Todo pasa a hora local, que es la que el operador tiene en la muñeca.
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` local. Reemplaza a `new Date().toISOString().slice(0, 10)`. */
export function hoySql(fecha: Date = new Date()): string {
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

/** `YYYY-MM-DD HH:MM:SS` local. Reemplaza a `CURRENT_TIMESTAMP` de SQLite. */
export function ahoraSql(fecha: Date = new Date()): string {
  return `${hoySql(fecha)} ${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`;
}
