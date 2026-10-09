/*
 * Un TAG que no se pudo dar por enviado, con el detalle de por qué.
 *
 * Antes la falla de un envío llegaba a la pantalla como un Error con solo el
 * texto, y desde ahí era imposible distinguir dos cosas muy distintas para el
 * operador:
 *
 *   - "No se envió": el servidor no tiene el TAG. Se puede reintentar sin riesgo.
 *   - "No sabemos si se envió": el servidor pudo haberlo guardado y la respuesta
 *     se perdió. No debe editarlo ni darlo por perdido.
 *
 * Sigue siendo un Error con su mensaje, así que lo que hoy lee `err.message`
 * funciona igual.
 */
export class EnvioFallidoError extends Error {
  readonly enDuda: boolean;
  readonly conflicto: boolean;
  readonly cambioTrasEnvio: boolean;
  readonly yaSeEnvia: boolean;

  constructor(
    message: string,
    detalle: {
      /** El servidor pudo haber guardado el TAG; no se pudo averiguar. */
      enDuda?: boolean;
      /** El identificador pertenece a otro TAG. */
      conflicto?: boolean;
      /** El TAG cambió después de un envío que el servidor tiene o pudo tener. */
      cambioTrasEnvio?: boolean;
      /** Otro envío del mismo TAG está en marcha: no es un fallo, hay que esperar. */
      yaSeEnvia?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'EnvioFallidoError';
    this.enDuda = detalle.enDuda ?? false;
    this.conflicto = detalle.conflicto ?? false;
    this.cambioTrasEnvio = detalle.cambioTrasEnvio ?? false;
    this.yaSeEnvia = detalle.yaSeEnvia ?? false;
  }
}
