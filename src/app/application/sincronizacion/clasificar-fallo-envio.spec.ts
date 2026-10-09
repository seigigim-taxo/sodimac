import { clasificarFalloEnvio } from './clasificar-fallo-envio';
import { ApiError } from '../../domain/shared/errors/api.error';
import { NetworkError } from '../../domain/shared/errors/network.error';

/*
 * De esta función depende si un TAG vuelve a ser editable. La regla central:
 * ante la duda, EN_DUDA. Equivocarse hacia "NO_LLEGO" deja editar un TAG que el
 * servidor ya tiene, que es justo el problema que se está resolviendo.
 */
describe('clasificarFalloEnvio', () => {
  describe('NO_LLEGO: se sabe que el servidor no lo tiene', () => {
    it('la solicitud no salió porque la PDA estaba sin red', () => {
      expect(clasificarFalloEnvio(new NetworkError('Sin conexión con el servidor.', true, false))).toBe('NO_LLEGO');
    });

    for (const status of [400, 401, 404, 405, 422, 500, 503]) {
      it(`el servidor contestó ${status} con su mensaje: rechazó y no guardó nada`, () => {
        expect(clasificarFalloEnvio(new ApiError('Falta TAG.', status, null, null))).toBe('NO_LLEGO');
      });
    }

    it('un 400 por cantidad negativa', () => {
      expect(clasificarFalloEnvio(new ApiError('Se recibio una cantidad negativa.', 400))).toBe('NO_LLEGO');
    });
  });

  describe('YA_LO_TIENE: el servidor tiene ese envío', () => {
    it('409 con CARGA_EXISTENTE_DISTINTA (mismo envío, otra cantidad de lecturas)', () => {
      expect(clasificarFalloEnvio(new ApiError('x', 409, 'CARGA_EXISTENTE_DISTINTA'))).toBe('YA_LO_TIENE');
    });

    // Un servidor anterior no manda código: se asume lo mismo y se confirma
    // después con la identidad que devuelve la consulta.
    it('409 sin código (servidor anterior)', () => {
      expect(clasificarFalloEnvio(new ApiError('El envio ya existe...', 409, null))).toBe('YA_LO_TIENE');
    });

    it('409 con un código que no se conoce', () => {
      expect(clasificarFalloEnvio(new ApiError('x', 409, 'CODIGO_NUEVO'))).toBe('YA_LO_TIENE');
    });
  });

  describe('CONFLICTO: el identificador existe pero es de otro envío', () => {
    it('409 de otro TAG, tienda o iteración', () => {
      expect(clasificarFalloEnvio(new ApiError('x', 409, 'CARGA_EXISTENTE_OTRO_TAG'))).toBe('CONFLICTO');
    });

    it('409 de otra agenda', () => {
      expect(clasificarFalloEnvio(new ApiError('x', 409, 'CARGA_EXISTENTE_OTRA_AGENDA'))).toBe('CONFLICTO');
    });
  });

  describe('EN_DUDA: no se sabe si el servidor lo guardó', () => {
    it('salió y no volvió una respuesta completa', () => {
      expect(clasificarFalloEnvio(new NetworkError('La respuesta del servidor llegó incompleta.', true, true))).toBe('EN_DUDA');
    });

    it('un NetworkError por defecto (la solicitud pudo haber salido)', () => {
      expect(clasificarFalloEnvio(new NetworkError('El servidor no respondió a tiempo.'))).toBe('EN_DUDA');
    });

    it('una respuesta que llegó pero no se reconoce', () => {
      expect(clasificarFalloEnvio(new NetworkError('Datos que la aplicación no reconoce.', false, true))).toBe('EN_DUDA');
    });

    it('un "OK" sin datos: el servidor procesó y la respuesta no sirve', () => {
      expect(clasificarFalloEnvio(new ApiError('Respuesta del servicio sin datos', 200, 'SIN_DATOS'))).toBe('EN_DUDA');
    });

    it('un Error cualquiera, que no se sabe de dónde viene', () => {
      expect(clasificarFalloEnvio(new Error('algo raro'))).toBe('EN_DUDA');
    });

    it('algo que ni siquiera es un Error', () => {
      expect(clasificarFalloEnvio('texto')).toBe('EN_DUDA');
      expect(clasificarFalloEnvio(null)).toBe('EN_DUDA');
      expect(clasificarFalloEnvio(undefined)).toBe('EN_DUDA');
    });
  });

  describe('las líneas que no se pueden cruzar', () => {
    // Un servidor que contestó con error NO es lo mismo que un corte de red,
    // aunque el texto del mensaje mencione "timeout" o "network".
    it('un ApiError con "timeout" en el mensaje no es una duda', () => {
      expect(clasificarFalloEnvio(new ApiError('Error de timeout en la base', 500))).toBe('NO_LLEGO');
    });

    it('un corte de red no es un rechazo del servidor', () => {
      expect(clasificarFalloEnvio(new NetworkError('x', true, true))).not.toBe('NO_LLEGO');
    });

    it('un 409 nunca es "no llegó": el servidor tiene algo con ese identificador', () => {
      for (const codigo of [null, 'CARGA_EXISTENTE_DISTINTA', 'CARGA_EXISTENTE_OTRO_TAG', 'CARGA_EXISTENTE_OTRA_AGENDA', 'X']) {
        expect(clasificarFalloEnvio(new ApiError('x', 409, codigo))).not.toBe('NO_LLEGO');
      }
    });
  });
});
