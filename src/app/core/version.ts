/*
 * Versión visible de la app. Se muestra en el login y en el menú lateral para
 * que, cuando un operador reporte algo desde terreno, se sepa qué build tiene
 * instalada — las APK se distribuyen a mano y conviven varias a la vez.
 *
 * Va acá y no en los environments para no repetirla cuatro veces y que se
 * separen. Tiene que moverse junto con la de package.json.
 */
export const APP_VERSION = '1.0.6';
