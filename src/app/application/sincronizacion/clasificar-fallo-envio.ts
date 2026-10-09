import { ApiError } from '../../domain/shared/errors/api.error';
import { NetworkError } from '../../domain/shared/errors/network.error';

/*
 * Qué se puede concluir de un envío que falló, para decidir si el TAG se puede
 * seguir tocando.
 *
 *   NO_LLEGO     El servidor NO tiene el envío: la solicitud no salió (sin red) o
 *                el servidor contestó con un error sin guardar nada. El TAG sigue
 *                siendo editable y se puede volver a enviar.
 *   YA_LO_TIENE  El servidor SÍ tiene un envío con ese identificador (409).
 *   CONFLICTO    Ese identificador existe pero pertenece a OTRO TAG u otra agenda.
 *                No prueba que el nuestro llegó: no se da por enviado.
 *   EN_DUDA      No se sabe. Salió y no volvió una respuesta completa (timeout,
 *                corte a medio camino, cuerpo ilegible, cancelado) o pasó algo no
 *                reconocido. El servidor pudo haberlo guardado.
 *
 * La regla ante cualquier duda es EN_DUDA. Equivocarse hacia "NO_LLEGO" hace
 * editable un TAG que el servidor ya tiene —el origen de este problema—;
 * equivocarse hacia "EN_DUDA" solo bloquea el TAG hasta que se pregunte.
 */
export type FalloEnvio = 'NO_LLEGO' | 'YA_LO_TIENE' | 'CONFLICTO' | 'EN_DUDA';

/* Los `codigo` que tag-finalizado.php manda en un 409. */
export const CODIGO_CARGA_DISTINTA = 'CARGA_EXISTENTE_DISTINTA';
const CODIGOS_DE_CONFLICTO: readonly string[] = ['CARGA_EXISTENTE_OTRO_TAG', 'CARGA_EXISTENTE_OTRA_AGENDA'];

export function clasificarFalloEnvio(err: unknown): FalloEnvio {
  if (err instanceof ApiError) {
    /*
     * 409: el identificador ya existe en el servidor. El `codigo` distingue si es
     * el mismo envío con otro contenido o un identificador ajeno. Sin código (un
     * servidor anterior a este cambio) se asume el primer caso, y quien resuelve
     * lo confirma con la identidad que devuelve la consulta.
     */
    if (err.status === 409) {
      return err.codigo !== null && CODIGOS_DE_CONFLICTO.includes(err.codigo) ? 'CONFLICTO' : 'YA_LO_TIENE';
    }

    /*
     * Un "OK" sin datos: el servidor respondió bien pero la respuesta no sirve.
     * Procesó la solicitud, así que pudo haberlo guardado.
     */
    if (err.status >= 200 && err.status < 300) return 'EN_DUDA';

    // Cualquier otro error con respuesta del servidor: rechazó y no guardó nada.
    return 'NO_LLEGO';
  }

  if (err instanceof NetworkError) {
    return err.solicitudEnviada ? 'EN_DUDA' : 'NO_LLEGO';
  }

  return 'EN_DUDA';
}
