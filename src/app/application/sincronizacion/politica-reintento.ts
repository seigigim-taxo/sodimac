/*
 * Cuándo reintentar un envío que no salió, cuidando la batería de la PDA.
 *
 * Nada acá consulta un reloj ni usa temporizadores: son reglas puras que decide
 * quien las llama. Así se pueden probar sin esperar.
 *
 * Los reintentos automáticos nacen de un evento (volvió la red, volvió a la app,
 * entró al Home) o de un único temporizador con espera creciente. Nunca de un
 * sondeo constante: despertar la radio de la PDA cada pocos segundos para
 * preguntar "¿hay algo?" es lo que más batería gasta.
 */

/** Espera tras cada fallo seguido, en ms: 30 s, 1, 2, 5 y 10 min. */
export const ESPERAS_TRAS_FALLO_MS: readonly number[] = [30_000, 60_000, 120_000, 300_000, 600_000];

/*
 * Con tantos fallos seguidos el temporizador se detiene; solo un evento lo
 * retoma. Son el intento original más los 5 reintentos de la escala de arriba.
 */
export const MAX_FALLOS_SEGUIDOS = ESPERAS_TRAS_FALLO_MS.length + 1;

/** Mínimo entre dos intentos disparados por eventos, para que una señal que parpadea no haga ráfagas. */
export const MIN_ENTRE_INTENTOS_MS = 15_000;

/*
 * Cuánto esperar antes del próximo intento automático, o null si ya no hay que
 * programar ninguno. `fallosSeguidos` cuenta los intentos seguidos que no
 * lograron enviar todo (el primer fallo es 1).
 */
export function esperaTrasFallo(fallosSeguidos: number): number | null {
  if (fallosSeguidos < 1 || fallosSeguidos >= MAX_FALLOS_SEGUIDOS) return null;
  return ESPERAS_TRAS_FALLO_MS[fallosSeguidos - 1];
}

/* ¿Pasó el mínimo desde el último intento? Sin intento previo, sí. */
export function puedeIntentarYa(ultimoIntentoMs: number | null, ahoraMs: number): boolean {
  return ultimoIntentoMs === null || ahoraMs - ultimoIntentoMs >= MIN_ENTRE_INTENTOS_MS;
}
