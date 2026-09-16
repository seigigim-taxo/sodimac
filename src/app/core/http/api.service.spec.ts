import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { NetworkError } from '../../domain/shared/errors/network.error';
import { ConnectionQualityService } from '../../shared/services/connection-quality.service';

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
      headers: new Headers(),
      text: () => Promise.resolve(JSON.stringify({ status: 'ERROR', msg: 'Usuario no existe o inactivo' })),
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
      headers: new Headers(),
      text: () => Promise.resolve(JSON.stringify({ status: 'ERROR', msg: 'Usuario no existe o inactivo' })),
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
   * —el TCP se aceptó bien—, así que llega hasta acá como un JSON truncado:
   * arranca como objeto ('{') pero no alcanza a cerrar. Sin Content-Length
   * (caso común en respuestas chunked), la forma del texto es la única pista.
   */
  it('un cuerpo truncado sin Content-Length (conexión cortada a medio camino) no deja pasar el SyntaxError crudo', async () => {
    fetchSpy.and.resolveTo({
      ok: true,
      headers: new Headers(),
      text: () => Promise.resolve('{"status":"OK","data":{"usuario":{"nombre":"Ana"'),
    } as Response);

    try {
      await api.post('x', {});
    } catch (e) {
      expect(e).toBeInstanceOf(NetworkError);
      expect((e as Error).message).not.toContain('JSON');
      expect((e as Error).message).toContain('incompleta');
      expect(console.error).toHaveBeenCalledWith(
        '[api] respuesta no es JSON válido (conexión cortada a medio camino):',
        jasmine.any(Error)
      );
    }
  });

  /*
   * Un SyntaxError de JSON.parse no siempre significa que la conexión se
   * cortó: un proxy/WAF corporativo puede devolver una página de error en
   * HTML, o el backend un body vacío por un bug. Decirle al operador "revisa
   * la conexión" ahí sería un diagnóstico falso.
   */
  it('un cuerpo que no parece JSON truncado (ej. HTML de un proxy) no se etiqueta como corte de conexión', async () => {
    fetchSpy.and.resolveTo({
      ok: true,
      headers: new Headers(),
      text: () => Promise.resolve('<html><body>502 Bad Gateway</body></html>'),
    } as Response);

    try {
      await api.post('x', {});
    } catch (e) {
      expect(e).toBeInstanceOf(NetworkError);
      expect((e as Error).message).not.toContain('conexión');
      expect((e as Error).message).toContain('no reconoce');
      expect(console.error).toHaveBeenCalledWith(
        '[api] respuesta no es JSON válido (no parece un corte de conexión):',
        jasmine.any(Error)
      );
    }
  });

  /*
   * Con Content-Length, la detección deja de ser una adivinanza por forma de
   * texto: si llegaron menos bytes de los prometidos, fue un corte real, aunque
   * el buffer recibido esté vacío o no arranque con '{'/'[' — el caso que la
   * heurística por forma sola no podía atrapar (falso negativo).
   */
  it('con Content-Length, un cuerpo vacío por corte temprano SÍ se detecta como truncado', async () => {
    fetchSpy.and.resolveTo({
      ok: true,
      headers: new Headers({ 'content-length': '500' }),
      text: () => Promise.resolve(''),
    } as Response);

    try {
      await api.post('x', {});
    } catch (e) {
      expect((e as Error).message).toContain('incompleta');
      expect(console.error).toHaveBeenCalledWith(
        '[api] respuesta no es JSON válido (conexión cortada a medio camino):',
        jasmine.any(Error)
      );
    }
  });

  /*
   * Y en la otra dirección: si Content-Length confirma que llegó el cuerpo
   * completo, un JSON que igual no parsea es un bug del propio backend, no un
   * corte de conexión — aunque arranque con '{' (el caso que la heurística
   * por forma sola clasificaba mal como "truncado", un falso positivo).
   */
  it('con Content-Length, un cuerpo completo pero mal formado NO se etiqueta como corte de conexión', async () => {
    const cuerpo = '{"status":"OK", "data": NaN}'; // JSON.parse no acepta NaN
    fetchSpy.and.resolveTo({
      ok: true,
      headers: new Headers({ 'content-length': String(new TextEncoder().encode(cuerpo).length) }),
      text: () => Promise.resolve(cuerpo),
    } as Response);

    try {
      await api.post('x', {});
    } catch (e) {
      expect((e as Error).message).toContain('no reconoce');
      expect(console.error).toHaveBeenCalledWith(
        '[api] respuesta no es JSON válido (no parece un corte de conexión):',
        jasmine.any(Error)
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

/*
 * ConnectionQualityService estima la calidad de la red con tráfico real de
 * la app: le importa si fetch() resolvió o no, no el status HTTP ni el
 * contenido del body. Se prueba por separado del resto de los errores de
 * arriba porque lo que se verifica acá es el side-effect del registro, no
 * el mensaje que ve el operador.
 */
describe('ApiService — reporta la calidad de conexión', () => {
  let api: ApiService;
  let fetchSpy: jasmine.Spy;
  let connectionQuality: jasmine.SpyObj<ConnectionQualityService>;

  beforeEach(() => {
    connectionQuality = jasmine.createSpyObj('ConnectionQualityService', ['registrarExito', 'registrarFallo']);
    TestBed.configureTestingModule({
      providers: [ApiService, { provide: ConnectionQualityService, useValue: connectionQuality }],
    });
    api = TestBed.inject(ApiService);
    fetchSpy = spyOn(globalThis, 'fetch');
    spyOn(console, 'error');
  });

  it('un fetch que resuelve registra éxito, sin importar el status HTTP', async () => {
    fetchSpy.and.resolveTo({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ status: 'ERROR', msg: 'Usuario no existe o inactivo' })),
    } as Response);

    try {
      await api.post('x', {});
    } catch {
      // el rechazo de negocio no es lo que se prueba acá
    }

    expect(connectionQuality.registrarExito).toHaveBeenCalledWith(jasmine.any(Number));
    expect(connectionQuality.registrarFallo).not.toHaveBeenCalled();
  });

  it('un fetch que rechaza (red caída o timeout) registra fallo', async () => {
    fetchSpy.and.rejectWith(new TypeError('Failed to fetch'));

    try {
      await api.post('x', {});
    } catch {
      // el NetworkError mapeado no es lo que se prueba acá
    }

    expect(connectionQuality.registrarFallo).toHaveBeenCalled();
    expect(connectionQuality.registrarExito).not.toHaveBeenCalled();
  });

  it('un body truncado NO cuenta como fallo de conexión: fetch sí resolvió', async () => {
    fetchSpy.and.resolveTo({
      ok: true,
      headers: new Headers(),
      text: () => Promise.resolve('{"status":"OK","data":{"usuario":{"nombre":"Ana"'),
    } as Response);

    try {
      await api.post('x', {});
    } catch {
      // acá lo que importa es el registro, no el NetworkError resultante
    }

    expect(connectionQuality.registrarExito).toHaveBeenCalledWith(jasmine.any(Number));
    expect(connectionQuality.registrarFallo).not.toHaveBeenCalled();
  });
});
