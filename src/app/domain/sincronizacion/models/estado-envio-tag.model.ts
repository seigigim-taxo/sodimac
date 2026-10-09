/*
 * Qué se sabe del envío de un TAG al servidor. Es la pregunta de la que depende
 * si el TAG se puede tocar.
 *
 * LA REGLA: un TAG es editable solo si el servidor NO lo recibió.
 *
 * El problema es que la PDA no siempre lo sabe. El servidor puede haber
 * guardado el TAG y la respuesta perderse en el camino; desde el dispositivo,
 * eso es indistinguible de que nunca llegó. Por eso hay cuatro estados y no dos:
 *
 *   SIN_ENVIO    Nunca se intentó enviar. Editable.
 *   NO_RECIBIDO  Se intentó y SE SABE que el servidor no lo tiene: la solicitud
 *                no salió (sin red) o el servidor la rechazó sin guardar nada.
 *                Editable, y se puede volver a enviar.
 *   EN_DUDA      Se intentó y no se sabe: no hubo respuesta completa, o la app
 *                se cerró a mitad del envío. El servidor pudo haberlo guardado.
 *                NO editable hasta averiguarlo.
 *   ENVIADO      El servidor lo tiene. NO editable.
 *
 * Se apoya en los estados que ya tiene sod_sincronizacion, sin columnas ni
 * tablas nuevas:
 *
 *   PENDIENTE → EN_DUDA     (resultado sin resolver)
 *   ERROR     → NO_RECIBIDO (fallo con certeza)
 *   ENVIADO   → ENVIADO
 *
 * Eso es a propósito. Cambiar la versión de la base obligaría a la app a
 * recrearla si alguien vuelve a instalar una APK anterior (ver migraciones.ts:
 * "la base está en vN y esta versión es vM"), y con eso se perderían los TAGs
 * sin enviar.
 */
export type EstadoEnvioTag = 'SIN_ENVIO' | 'NO_RECIBIDO' | 'EN_DUDA' | 'ENVIADO';

export interface EnvioTag {
  estado: EstadoEnvioTag;
  /** El envío al que se refiere el estado; null si nunca hubo uno. */
  cargaUid: string | null;
  /**
   * Texto del último intento (el error, o el aviso de diferencias). Sirve para
   * mostrarlo y para soporte; no para decidir.
   */
  detalle: string | null;
}

/* ¿Se puede modificar, borrar o reabrir un TAG con este estado de envío? */
export function bloqueaEdicion(estado: EstadoEnvioTag): boolean {
  return estado === 'EN_DUDA' || estado === 'ENVIADO';
}

/* Qué se le dice al operador cuando algo se le niega por esa razón. */
export function mensajeBloqueo(estado: EstadoEnvioTag): string {
  return estado === 'EN_DUDA'
    ? 'No pudimos confirmar si este TAG llegó al servidor. Espera a que se verifique antes de modificarlo.'
    : 'Este TAG ya se envió y no se puede modificar.';
}
