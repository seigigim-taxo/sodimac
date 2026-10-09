/*
 * Una respuesta del servidor que dice que algo salió mal: el cuerpo llegó
 * completo, es JSON válido y trae `status: 'ERROR'`.
 *
 * Existe para separarlo de [NetworkError]. Los dos son "un envío que falló",
 * pero significan cosas opuestas sobre el servidor:
 *
 *   - NetworkError: no hay respuesta (o no se pudo leer). El servidor pudo
 *     haber recibido y guardado lo enviado — la PDA no puede saberlo.
 *   - ApiError: SÍ hubo respuesta. El servidor contestó y dijo qué pasó.
 *
 * Antes ApiService lanzaba un Error plano con solo el texto, y el código HTTP,
 * el `codigo` estable y los datos del cuerpo se perdían. Sin ellos, la app no
 * tenía cómo distinguir un rechazo definitivo (400: no se guardó nada) de un
 * "ya existe" (409: el servidor SÍ lo tiene) sin leer la redacción del mensaje.
 *
 * Sigue siendo un Error con el mensaje del servidor: todo lo que hoy lee
 * `err.message` sigue funcionando igual.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    /** Código HTTP de la respuesta. */
    readonly status: number,
    /** Identificador estable del error, si el servidor lo manda (`codigo`). */
    readonly codigo: string | null = null,
    /** El `data` del cuerpo, si vino (por ejemplo los totales del envío existente). */
    readonly datos: unknown = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
