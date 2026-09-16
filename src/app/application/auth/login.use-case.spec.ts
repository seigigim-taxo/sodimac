import { TestBed } from '@angular/core/testing';
import { LoginUseCase } from './login.use-case';
import { LoginOnlineUseCase } from './login-online.use-case';
import { OPERADOR_REPOSITORY_TOKEN } from '../../domain/auth/repositories/operador.repository';
import { NetworkError } from '../../domain/shared/errors/network.error';

const REQUEST = { rut: '99800120K', password: '998001' };

/*
 * Sin operador en caché, un NetworkError de la búsqueda online es la única
 * salida: no hay a dónde caer. El mensaje que ve el operador tiene que decir
 * las dos cosas — la causa real (la que armó ApiService) y que acá no hay
 * sesión guardada para entrar sin conexión.
 */
describe('LoginUseCase — sin caché y falla la red', () => {
  let caso: LoginUseCase;
  let onlineExecute: jasmine.Spy;

  beforeEach(() => {
    onlineExecute = jasmine.createSpy('execute');

    TestBed.configureTestingModule({
      providers: [
        LoginUseCase,
        { provide: LoginOnlineUseCase, useValue: { execute: onlineExecute } },
        { provide: OPERADOR_REPOSITORY_TOKEN, useValue: { obtenerPorRut: () => Promise.resolve(null) } },
      ],
    });

    caso = TestBed.inject(LoginUseCase);
  });

  it('conserva el mensaje específico del NetworkError, no uno genérico', async () => {
    onlineExecute.and.rejectWith(
      new NetworkError('La respuesta del servidor llegó incompleta. Revisa la conexión e intenta de nuevo.')
    );

    try {
      await caso.execute(REQUEST);
      fail('debía lanzar');
    } catch (e) {
      expect((e as Error).message).toContain('La respuesta del servidor llegó incompleta');
      expect((e as Error).message).toContain('No hay una sesión guardada en este dispositivo');
    }
  });

  it('un error que no es de red se propaga tal cual', async () => {
    onlineExecute.and.rejectWith(new Error('Usuario no existe o inactivo'));

    try {
      await caso.execute(REQUEST);
      fail('debía lanzar');
    } catch (e) {
      expect((e as Error).message).toBe('Usuario no existe o inactivo');
    }
  });
});
