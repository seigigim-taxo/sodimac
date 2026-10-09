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

/*
 * Cuántos días hacia adelante acepta la app una jornada como "la próxima".
 *
 * El backend (preparacion.php) busca la primera fecha con agenda dentro de 7
 * días: un viernes es el lunes y, con feriados en medio, puede ser el jueves.
 * La app acepta más (14) a propósito, para que subir ese tope allá no obligue a
 * publicar otra APK. Si el backend llegara a superar este valor, la jornada
 * llegaría a la PDA y no se ofrecería.
 */
export const HORIZONTE_VENTANA_DIAS = 14;

/**
 * `YYYY-MM-DD` de una fecha YA en ese formato, más `dias` (puede ser negativo).
 * Cadena vacía si la fecha no se puede leer.
 *
 * Se calcula con setDate y no sumando 86.400.000 ms por día: en un cambio de
 * horario un día dura 23 o 25 horas, y sumar milisegundos daría la fecha
 * equivocada justo ese día. setDate deja que el calendario resuelva además el
 * fin de mes y el año bisiesto.
 */
export function sumarDias(dia: string, dias: number): string {
  const [anio, mes, num] = dia.split('-').map(Number);
  if (!anio || !mes || !num) return '';

  const resultado = new Date(anio, mes - 1, num);
  resultado.setDate(resultado.getDate() + dias);
  return hoySql(resultado);
}

/**
 * El rango de fechas con el que trabaja el operador: desde HOY hasta hoy más
 * HORIZONTE_VENTANA_DIAS. Lo usan las consultas SQL; el resto de la app
 * pregunta por una fecha con enVentanaOperativa().
 *
 * Con un `hoy` que no se puede leer la ventana queda vacía, no abierta: sin
 * límite superior, cualquier fecha entraría por comparación de textos.
 */
export function ventanaOperativa(hoy: string = hoySql()): { desde: string; hasta: string } {
  const hasta = sumarDias(hoy, HORIZONTE_VENTANA_DIAS);
  return hasta === '' ? { desde: '', hasta: '' } : { desde: hoy, hasta };
}

/**
 * ¿Esta fecha programada entra en la ventana con la que trabaja el operador?
 *
 * La ventana es HOY y la PRÓXIMA jornada. La próxima ya no es "mañana" a secas:
 * un viernes es el lunes, y con feriados en medio puede estar varios días
 * adelante. Por eso se acepta cualquier fecha desde hoy hasta
 * HORIZONTE_VENTANA_DIAS más adelante; cuántas se muestran en pantalla es otra
 * decisión, de Home. Ayer queda afuera — al cambiar el día lo anterior se da por
 * cerrado, incluso lo que no alcanzó a sincronizarse.
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;

  const { desde, hasta } = ventanaOperativa(hoy);
  if (desde === '') return false;

  return dia >= desde && dia <= hasta;
}

/**
 * De los días (`YYYY-MM-DD`) de las jornadas que caben en la ventana, cuáles se
 * ofrecen en pantalla: HOY, si hay, y la PRÓXIMA —la primera fecha posterior—.
 *
 * La ventana (enVentanaOperativa) es ancha a propósito, para no perder trabajo
 * si el backend sube su tope. Mostrar todo lo que cabe en ella no sirve: con una
 * jornada vieja que quedó guardada, el operador vería una tarjeta de una fecha
 * lejana y podría elegirla por error. Hoy y la próxima son las dos que existen
 * de verdad para él.
 *
 * Sin jornada hoy, se ofrece solo la próxima. Devuelve los días ordenados y sin
 * repetir.
 */
export function diasOfrecidos(dias: string[], hoy: string = hoySql()): string[] {
  const unicos = [...new Set(dias.map((d) => (d ?? '').slice(0, 10)))].filter((d) => d !== '').sort();
  const deHoy = unicos.filter((d) => d === hoy);
  const proxima = unicos.find((d) => d > hoy);
  return proxima ? [...deHoy, proxima] : deHoy;
}

/* Indexado por Date.getDay(): 0 = domingo. Escritos acá y no con Intl: el
 * WebView de la PDA puede no traer el locale. */
const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Cómo se nombra una jornada en pantalla: "Hoy", "Mañana" o, para cualquier
 * otro día, el día de la semana con su fecha corta (`Lun 12/10`).
 *
 * "Hoy" y "Mañana" bastan mientras la jornada sea contigua; un lunes visto
 * desde el viernes necesita el día de la semana, o el operador tiene que
 * calcular qué fecha es en la pantalla chica de una PDA, muchas veces con
 * guantes y apurado. Un día pasado no recibe "Ayer": se nombra por su fecha,
 * que es un hecho y no una etiqueta que le dé aire de normalidad.
 *
 * Una fecha que no se puede leer se devuelve tal cual.
 */
export function etiquetaDia(fechaProgramada: string, hoy: string = hoySql()): string {
  const dia = (fechaProgramada ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return fechaProgramada ?? '';

  const [anio, mes, num] = dia.split('-').map(Number);
  if (!anio || !mes || !num) return fechaProgramada;

  if (dia === hoy) return 'Hoy';
  if (dia === sumarDias(hoy, 1)) return 'Mañana';

  const nombre = DIAS_SEMANA[new Date(anio, mes - 1, num).getDay()];
  return `${nombre} ${pad(num)}/${pad(mes)}`;
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
