import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { NetworkError } from '../../domain/shared/errors/network.error';

/*
 * Lo que se prueba acá es que NINGÚN mensaje del navegador llegue a la pantalla
 * del operador.
 *
 * Pasó de verdad: al buscar un conteo nuevo, Home mostraba "Failed to fetch"
 * —en inglés, y sin decirle qué hacer—. mapError detectaba bien que era un
 * fallo de red, pero construía el NetworkError reenviando el mensaje original
 * en vez de escribir uno propio.
 *
 * Tampoco le servía a soporte: fetch usa ese mismo texto para una red caída, un
 * 404, un CORS y un socket cortado. El detalle técnico va a la consola, que es
 * donde sí se puede diagnosticar con logcat.
 */
describe('ApiService — errores que ve el operador', () => {
  let api: ApiService;
  let fetchSpy: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ApiService] });
    api = TestBed.inject(ApiService);
    fetchSpy = spyOn(globalThis, 'fetch');
    spyOn(console, 'error');
  });

  /* Los textos crudos que fetch produce en cada plataforma. */
  const mensajesDelNavegador = [
    'Failed to fetch',
    'NetworkError when attempting to fetch resource.',
    'Load failed',
    'Failed to connect to /50.16.13.230:80',
    'Unable to resolve host',
  ];

  for (const crudo of mensajesDelNavegador) {
    it(`no deja pasar "${crudo}"`, async () => {
      fetchSpy.and.rejectWith(new TypeError(crudo));

      await expectAsync(api.post('x', {})).toBeRejectedWithError(NetworkError);

      try {
        await api.post('x', {});
      } catch (e) {
        const mensaje = (e as Error).message;
        expect(mensaje).not.toContain(crudo);
        expect(mensaje).toContain('conexión');
      }
    });
  }

  /*
   * El timeout ya tenía su mensaje propio y se distingue del resto: al operador
   * le sirve saber que el servidor está pero tardó, porque reintentar puede
   * funcionar.
   */
  it('el timeout conserva su mensaje distinto', async () => {
    const timeout = new Error('signal timed out');
    timeout.name = 'TimeoutError';
    fetchSpy.and.rejectWith(timeout);

    try {
      await api.post('x', {});
    } catch (e) {
      expect((e as Error).message).toContain('no respondió a tiempo');
    }
  });

  /*
   * Un error del propio servicio —status ERROR con su msg— NO se toca: ese
   * texto lo escribió el backend para que se lea, a diferencia del del
   * navegador.
   */
  it('respeta el mensaje que manda el servidor', async () => {
    fetchSpy.and.resolveTo({
      ok: true,
      json: () => Promise.resolve({ status: 'ERROR', msg: 'Usuario no existe o inactivo' }),
    } as Response);

    try {
      await api.post('x', {});
    } catch (e) {
      expect((e as Error).message).toBe('Usuario no existe o inactivo');
    }
  });

  /*
   * REGRESIÓN REAL: errorResponse() del backend manda status HTTP de negocio
   * (401, 405, 500...) con el mensaje específico en el body — no son fallas
   * del servidor, son respuestas normales. Un chequeo de response.ok que corte
   * antes de leer el body le roba a unwrap() ese mensaje y lo reemplaza por
   * uno genérico. Pasó de verdad al hacer esto una vez: un login rechazado
   * dejó de decir "Usuario no existe o inactivo".
   */
  it('un status HTTP de error (401) igual deja pasar el mensaje real del backend', async () => {
    fetchSpy.and.resolveTo({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ status: 'ERROR', msg: 'Usuario no existe o inactivo' }),
    } as Response);

    try {
      await api.post('x', {});
    } catch (e) {
      expect((e as Error).message).toBe('Usuario no existe o inactivo');
    }
  });

  /*
   * El escenario real que motivó esto: "WiFi de tienda a medio asociar" corta
   * la conexión mientras baja el body. fetch() no lo ve como un error de red
   * —el TCP se aceptó bien—, así que llega hasta acá como un JSON truncado.
   */
  it('un cuerpo truncado (conexión cortada a medio camino) no deja pasar el SyntaxError crudo', async () => {
    const errorDeParseo = new SyntaxError("Unexpected end of JSON input");
    fetchSpy.and.resolveTo({
      ok: true,
      json: () => Promise.reject(errorDeParseo),
    } as Response);

    try {
      await api.post('x', {});
    } catch (e) {
      expect(e).toBeInstanceOf(NetworkError);
      expect((e as Error).message).not.toContain('JSON');
      expect((e as Error).message).toContain('incompleta');
      expect(console.error).toHaveBeenCalledWith(
        '[api] respuesta no es JSON válido (conexión cortada a medio camino):',
        errorDeParseo
      );
    }
  });

  // El detalle técnico tiene que quedar en el log para soporte.
  it('deja el mensaje original en consola', async () => {
    fetchSpy.and.rejectWith(new TypeError('Failed to fetch'));

    try {
      await api.post('x', {});
    } catch {
      expect(console.error).toHaveBeenCalledWith('[api] fallo de red:', 'TypeError', 'Failed to fetch');
    }
  });
});
