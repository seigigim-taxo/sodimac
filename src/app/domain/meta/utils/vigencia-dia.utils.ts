/*
 * ¿Los datos que tiene la PDA son del día en curso?
 *
 * El problema que resuelve: al abrir sesión, la app consultaba SQLite y, si el
 * operador existía, lo dejaba entrar sin preguntar nada. Resultado — se quedaba
 * trabajando sobre el evento del día anterior, y llegó a enviarse un conteo
 * contra la agenda de ayer porque el equipo seguía parado en ese evento.
 *
 * La comparación es por FECHA LOCAL, nunca UTC. Con toISOString() la PDA pasa
 * al día siguiente a las 20:00 hora Chile, y eso acá significaría cerrarle la
 * sesión al operador en plena jornada. Para eso está hoySql() en
 * shared/utils/fecha.utils.
 */

/*
 * `ultimaPreparacion` es la fecha (YYYY-MM-DD) de la última descarga exitosa.
 * null = la PDA nunca preparó datos, así que hay que hacerlo.
 */
export function datosSonDeHoy(ultimaPreparacion: string | null, hoy: string): boolean {
  if (!ultimaPreparacion) return false;
  return ultimaPreparacion === hoy;
}

export function necesitaPreparar(ultimaPreparacion: string | null, hoy: string): boolean {
  return !datosSonDeHoy(ultimaPreparacion, hoy);
}

/*
 * Cerrar la sesión es más agresivo que sincronizar, así que pide más certeza:
 * solo cuando SE SABE que los datos son de otro día.
 *
 * Sin fecha registrada no se cierra nada. Podría ser una instalación recién
 * hecha o una base restaurada, y sacar al operador de la app en medio del turno
 * por no tener un dato es peor que dejarlo seguir — de la sincronización se
 * encarga necesitaPreparar(), que sí trata el null como "hay que bajar datos".
 */
export function debeCerrarSesionPorDia(ultimaPreparacion: string | null, hoy: string): boolean {
  if (!ultimaPreparacion) return false;
  return ultimaPreparacion !== hoy;
}
