import { TestBed } from '@angular/core/testing';
import { LoginUseCase } from './login.use-case';
import { LoginOnlineUseCase } from './login-online.use-case';
import { OPERADOR_REPOSITORY_TOKEN } from '../../domain/auth/repositories/operador.repository';
import { OperadorCacheado } from '../../domain/auth/models/operador-cacheado.model';
import { NetworkError } from '../../domain/shared/errors/network.error';

const REQUEST = { rut: '99800120K', password: '998001' };

const OPERADOR_CACHEADO: OperadorCacheado = {
  id: 42,
  rolId: 1,
  cargo: 'OPERADOR',
  rut: 998001,
  rutDv: 'K',
  nombres: 'Ana',
  apellidoPaterno: 'Soto',
  apellidoMaterno: null,
  nombreCompleto: 'Ana Soto',
  correo: 'ana.soto@sodimac.cl',
  tipoUsuario: 'OPERADOR',
  fechaRegistro: '2026-01-01T00:00:00',
};

/*
 * Política V4: cache-first. Con operador en caché, entra offline sin tocar
 * el WS — el mapeo de campos y fueOffline:true son lo único que garantiza
 * que esta rama, la más común en el uso diario, funcione bien.
 */
describe('LoginUseCase — con operador en caché', () => {
  let caso: LoginUseCase;
  let onlineExecute: jasmine.Spy;
  let obtenerPorRut: jasmine.Spy;

  beforeEach(() => {
    onlineExecute = jasmine.createSpy('execute');
    obtenerPorRut = jasmine.createSpy('obtenerPorRut').and.resolveTo(OPERADOR_CACHEADO);

    TestBed.configureTestingModule({
      providers: [
        LoginUseCase,
        { provide: LoginOnlineUseCase, useValue: { execute: onlineExecute } },
        { provide: OPERADOR_REPOSITORY_TOKEN, useValue: { obtenerPorRut } },
      ],
    });

    caso = TestBed.inject(LoginUseCase);
  });

  it('entra offline sin llamar al WS, mapeando los campos del operador cacheado', async () => {
    const resultado = await caso.execute(REQUEST);

    expect(resultado.fueOffline).toBeTrue();
    expect(resultado.session).toEqual({
      operadorId: 42,
      rutNormalizado: REQUEST.rut,
      correo: 'ana.soto@sodimac.cl',
      tipoUsuario: 'OPERADOR',
      nombreCompleto: 'Ana Soto',
    });
    expect(onlineExecute).not.toHaveBeenCalled();
  });

  it('rechaza antes de consultar el caché si la contraseña no coincide con el RUT', async () => {
    try {
      await caso.execute({ rut: REQUEST.rut, password: '000000' });
      fail('debía lanzar');
    } catch (e) {
      expect((e as Error).message).toBe('Contraseña incorrecta.');
    }
    expect(obtenerPorRut).not.toHaveBeenCalled();
    expect(onlineExecute).not.toHaveBeenCalled();
  });
});

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

  /*
   * Un NetworkError con esDeConectividad: false (ej. un JSON roto por un bug
   * del backend) no es "no hay conexión" — agregar el sufijo de sesión
   * offline sugeriría revisar la red cuando el problema es del servidor.
   */
  it('un NetworkError que no es de conectividad se propaga sin el sufijo de sesión offline', async () => {
    onlineExecute.and.rejectWith(
      new NetworkError('El servidor respondió con datos que la aplicación no reconoce. Avisa a soporte.', false)
    );

    try {
      await caso.execute(REQUEST);
      fail('debía lanzar');
    } catch (e) {
      expect((e as Error).message).toBe('El servidor respondió con datos que la aplicación no reconoce. Avisa a soporte.');
      expect((e as Error).message).not.toContain('sesión guardada');
    }
  });
});
