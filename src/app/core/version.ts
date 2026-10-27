/*
 * Versión visible de la app. Se muestra en el login y en el menú lateral para
 * que, cuando un operador reporte algo desde terreno, se sepa qué build tiene
 * instalada — las APK se distribuyen a mano y conviven varias a la vez.
 *
 * Va acá y no en los environments para no repetirla cuatro veces y que se
 * separen. Tiene que moverse junto con la de package.json.
 */
/*
 * Build de depuración (apk/debug-v4): el sufijo `-debug` se ve en el login y en el menú, y viaja
 * en los reportes de versión, para distinguirla de una versión de producción.
 */
export const APP_VERSION = '1.0.17-debug';
