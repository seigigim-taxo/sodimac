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

/**
 * `YYYY-MM-DD` local del día siguiente.
 *
 * Se calcula con setDate y no sumando 86.400.000 ms: en un cambio de horario
 * de verano un día dura 23 o 25 horas, y sumar segundos daría la fecha
 * equivocada justo ese día. setDate deja que el calendario resuelva además el
 * fin de mes y el año bisiesto.
 */
export function manianaSql(fecha: Date = new Date()): string {
  const siguiente = new Date(fecha);
  siguiente.setDate(siguiente.getDate() + 1);
  return hoySql(siguiente);
}

/**
 * ¿Esta fecha programada entra en la ventana con la que trabaja el operador?
 *
 * La ventana es HOY y MAÑANA: se pidió que el operador pueda adelantar la
 * jornada del día siguiente. Ayer queda afuera — al cambiar el día lo anterior
 * se da por cerrado, incluso lo que no alcanzó a sincronizarse.
 *
 * Vive en UNA función y no repetida en cada pantalla a propósito. Escrita
 * cuatro veces como `=== hoySql()` —Home, el historial, la restauración de
 * sesión y los TAGs pendientes— bastaba con olvidar una para que la app se
 * contradijera: mostrar una jornada que después no deja sincronizar.
 *
 * Tolera que la fecha venga con hora (`2026-08-31 08:00:00`): se compara solo
 * la parte del día.
 */
export function enVentanaOperativa(fechaProgramada: string, hoy: string = hoySql()): boolean {
  const dia = (fechaProgramada ?? '').slice(0, 10);
  if (dia === '') return false;

  return dia === hoy || dia === siguienteDia(hoy);
}

/*
 * El día siguiente a una fecha YA en formato `YYYY-MM-DD`.
 *
 * Se deriva del `hoy` recibido y no del reloj: así quien pasa un `hoy`
 * explícito —los tests, o una pantalla que ya lo calculó— obtiene una ventana
 * coherente con ESE día y no con la fecha real de la máquina.
 */
function siguienteDia(dia: string): string {
  const [anio, mes, num] = dia.split('-').map(Number);
  if (!anio || !mes || !num) return '';
  return manianaSql(new Date(anio, mes - 1, num));
}

/** `YYYY-MM-DD HH:MM:SS` local. Reemplaza a `CURRENT_TIMESTAMP` de SQLite. */
export function ahoraSql(fecha: Date = new Date()): string {
  return `${hoySql(fecha)} ${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`;
}

/*
 * `YYYY-MM-DD HH:MM:SS.mmm` local. Es el instante de una captura.
 *
 * Los milisegundos existen porque un operador con pistola escanea varios SKU
 * dentro del mismo segundo: sin ellos, el sello no distingue dos productos
 * consecutivos.
 *
 * Va SOLO en sod_conteo_lectura, que es un dato local. El fecha_hora de
 * sod_conteo_detalle sigue con ahoraSql() a propósito: ese viaja verbatim al
 * SGO y meterle milisegundos arriesga el parse del DATETIME en MySQL.
 */
export function ahoraSqlMs(fecha: Date = new Date()): string {
  return `${ahoraSql(fecha)}.${String(fecha.getMilliseconds()).padStart(3, '0')}`;
}

/*
 * Compacta una fecha SQL a `YYYYMMDDHHMMSSmmm` para meterla en un UID, donde
 * los separadores solo gastan largo.
 *
 * Tolera que le llegue sin milisegundos —una lectura registrada antes de que
 * ahoraSqlMs existiera— y la completa con 000. Así una línea vieja también
 * produce un UID válido en vez de romper la sincronización del TAG entero.
 */
export function selloUid(fechaSql: string): string {
  const soloDigitos = fechaSql.replace(/\D/g, '');
  return soloDigitos.padEnd(17, '0').slice(0, 17);
}
