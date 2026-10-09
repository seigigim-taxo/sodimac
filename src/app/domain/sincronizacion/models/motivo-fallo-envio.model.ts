/*
 * Por qué un envío no quedó confirmado, tal como se lo explica la pantalla al
 * operador. Son tres situaciones que piden reacciones distintas:
 *
 *   NO_ENVIADO   El servidor no lo tiene. Queda pendiente y se reintenta solo.
 *   EN_DUDA      Pudo haberlo recibido y la respuesta se perdió. No hay que
 *                volver a contarlo: la PDA lo verifica sola.
 *   YA_SE_ENVIA  Otro envío del mismo TAG está en marcha ahora. No es un fallo:
 *                basta con esperar unos segundos.
 */
export type MotivoFalloEnvio = 'NO_ENVIADO' | 'EN_DUDA' | 'YA_SE_ENVIA';
