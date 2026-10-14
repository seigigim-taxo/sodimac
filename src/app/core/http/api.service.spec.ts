import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { NetworkError } from '../../domain/shared/errors/network.error';
import { ApiError } from '../../domain/shared/errors/api.error';
import { AutoReportService } from '../error-report/auto-report.service';

/*
 * Lo que se prueba acá es que NINGÚN mensaje del navegador llegue a la pantalla
 * del operador.
 *
 * Pasó de verdad: al buscar un conteo nuevo, Home mostraba "Failed to fetch"
 * —en inglés, y sin decirle qué hacer—. mapError detectaba bien que era un
 * fallo de red, pero construía el NetworkError reenviando el mensaje original
 * en vez de escribir uno propio.
 *
 * Tampoco le servía a soporte: fetch usa ese mismo texto para una red caída,
 * un 404, un CORS y un socket cortado. El detalle técnico va a la consola, que
 * es donde sí se puede diagnosticar con logcat.
 */
describe('ApiService — errores que ve el operador', () => {
  let api: ApiService;
  let fetchSpy: jasmine.Spy;
  let autoReport: { reportar: jasmine.Spy };

  beforeEach(() => {
    autoReport = { reportar: jasmine.createSpy('reportar').and.resolveTo(undefined) };
    TestBed.configureTestingModule({
      providers: [
        ApiService,
        { provide: AutoReportService, useValue: autoReport },
      ],
    });
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
   * navegador. Pero SÍ deja reporte automático: es un fallo que soporte
   * necesita ver aunque el operador solo vea el mensaje.
   */
  it('respeta el mensaje que manda el servidor y además reporta', async () => {
    fetchSpy.and.resolveTo({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: () => Promise.resolve(JSON.stringify({ status: 'ERROR', msg: 'Usuario no existe o inactivo' })),
    } as Response);

    try {
      await api.post('x', {});
    } catch (e) {
      expect((e as Error).message).toBe('Usuario no existe o inactivo');
    }
    expect(autoReport.reportar).toHaveBeenCalledWith('POST x', 'Usuario no existe o inactivo');
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
      expect((e as NetworkError).esDeConectividad).toBeFalse();
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
      expect((e as NetworkError).esDeConectividad).toBeTrue();
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
      expect((e as NetworkError).esDeConectividad).toBeFalse();
      expect(console.error).toHaveBeenCalledWith(
        '[api] respuesta no es JSON válido (no parece un corte de conexión):',
        jasmine.any(Error)
      );
    }
  });

  /*
   * REGRESIÓN REAL: Content-Length describe el tamaño EN EL WIRE (comprimido
   * con gzip/br/deflate), pero `texto` ya llega descomprimido por fetch() —
   * comparar esas dos magnitudes no dice nada sobre si el body llegó
   * completo. Acá el texto descomprimido (aunque truncado) es MÁS GRANDE que
   * el Content-Length comprimido, así que comparar bytes sin más diría "no
   * truncado" (bytesRecibidos >= contentLength) pese a que sí lo está. Con el
   * fix, se ignora ese Content-Length y se cae a la forma del texto —que sí
   * detecta el corte real, porque arranca con '{' y no cierra.
   */
  it('con Content-Encoding gzip, Content-Length no se usa: un truncado real igual se detecta', async () => {
    const cuerpoTruncado = '{"status":"OK","data":{"usuario":{"nombre":"Ana"'; // arranca con '{', no cierra
    fetchSpy.and.resolveTo({
      ok: true,
      headers: new Headers({
        'content-length': '5', // tamaño comprimido, mucho menor al texto descomprimido
        'content-encoding': 'gzip',
      }),
      text: () => Promise.resolve(cuerpoTruncado),
    } as Response);

    try {
      await api.post('x', {});
    } catch (e) {
      // Sin el fix, el Content-Length (comprimido) compararía "menor" y diría
      // que SÍ llegó completo, perdiendo el aviso de conexión cortada.
      expect((e as Error).message).toContain('incompleta');
      expect(console.error).toHaveBeenCalledWith(
        '[api] respuesta no es JSON válido (conexión cortada a medio camino):',
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

  /*
   * Reportes automáticos: todo lo que la app no esperó tiene que quedar
   * registrado aunque el operador no haga nada. Es el punto único de control.
   */
  describe('reporte automático', () => {
    it('HTTP ≠ 200 genera reporte con método, path y status', async () => {
      fetchSpy.and.resolveTo({
        ok: false,
        status: 500,
        headers: new Headers(),
        text: () => Promise.resolve('<html>error del servidor</html>'),
      } as Response);

      await expectAsync(api.post('x', {})).toBeRejectedWithError(
        NetworkError,
        'El servidor respondió con datos que la aplicación no reconoce. Avisa a soporte.'
      );
      expect(autoReport.reportar).toHaveBeenCalledWith('POST x', 'HTTP 500 sin cuerpo JSON');
    });

    it('HTTP ≠ 200 con cuerpo JSON conserva el msg del backend y reporta', async () => {
      fetchSpy.and.resolveTo({
        ok: false,
        status: 404,
        text: () => Promise.resolve(JSON.stringify({ status: 'ERROR', msg: 'Recurso no encontrado' })),
      } as Response);

      await expectAsync(api.get('y')).toBeRejectedWithError('Recurso no encontrado');
      expect(autoReport.reportar).toHaveBeenCalledWith('GET y', 'HTTP 404: Recurso no encontrado');
    });

    it('respuesta que no es JSON genera reporte', async () => {
      fetchSpy.and.resolveTo({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve('<html>no soy json</html>'),
      } as Response);

      await expectAsync(api.post('x', {})).toBeRejectedWithError(
        NetworkError,
        'El servidor respondió con datos que la aplicación no reconoce. Avisa a soporte.'
      );
      expect(autoReport.reportar).toHaveBeenCalledWith('POST x', 'La respuesta no es JSON válido');
    });

    it('JSON sin objeto (null) genera reporte en vez de TypeError crudo', async () => {
      fetchSpy.and.resolveTo({
        ok: true,
        status: 200,
        text: () => Promise.resolve('null'),
      } as Response);

      await expectAsync(api.post('x', {})).toBeRejectedWithError('Respuesta inválida del servidor. Intenta de nuevo.');
      expect(autoReport.reportar).toHaveBeenCalledWith('POST x', 'Respuesta con forma inesperada: null');
    });

    it('data ausente genera reporte', async () => {
      fetchSpy.and.resolveTo({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ status: 'OK', msg: 'ok' })),
      } as Response);

      await expectAsync(api.post('x', {})).toBeRejectedWithError('Respuesta del servicio sin datos');
      expect(autoReport.reportar).toHaveBeenCalledWith('POST x', 'Respuesta sin data');
    });

    it('sinReporte omite el reporte (endpoint de reportes, login)', async () => {
      fetchSpy.and.resolveTo({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ status: 'ERROR', msg: 'Credencial inválida' })),
      } as Response);

      await expectAsync(api.post('auth/login.php', {}, { sinReporte: true })).toBeRejectedWithError('Credencial inválida');
      expect(autoReport.reportar).not.toHaveBeenCalled();
    });

    it('los fallos de red NO generan reporte', async () => {
      fetchSpy.and.rejectWith(new TypeError('Failed to fetch'));

      await expectAsync(api.post('x', {})).toBeRejectedWithError(NetworkError);
      expect(autoReport.reportar).not.toHaveBeenCalled();
    });
  });
});


/*
 * Qué sabe la app cuando un envío falla.
 *
 * Un envío fallido puede significar dos cosas opuestas sobre el servidor:
 *
 *   - Hubo respuesta y dijo "no" (ApiError): el servidor contestó. Con su código
 *     HTTP y su `codigo` se sabe si guardó algo (409: ya lo tiene) o no (400).
 *   - No hubo respuesta (NetworkError): el servidor pudo haber guardado el TAG y
 *     la PDA no se entera. Solo si el dispositivo ya estaba sin red al fallar se
 *     puede afirmar que la solicitud no salió.
 *
 * Antes todo llegaba como un Error plano con el texto, y esa diferencia se
 * perdía: de ahí un TAG recibido por el servidor que la PDA seguía mostrando
 * como pendiente.
 */
describe('ApiService — qué sabe la app cuando un envío falla', () => {
  let api: ApiService;
  let fetchSpy: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ApiService] });
    api = TestBed.inject(ApiService);
    fetchSpy = spyOn(globalThis, 'fetch');
    spyOn(console, 'error');
  });

  const respuesta = (status: number, cuerpo: unknown): Response => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    text: () => Promise.resolve(JSON.stringify(cuerpo)),
  } as Response);

  const rechazo = async (llamada: () => Promise<unknown>): Promise<unknown> => {
    try {
      await llamada();
    } catch (e) {
      return e;
    }
    throw new Error('Se esperaba que la llamada fallara');
  };

  describe('el servidor contestó con un error (ApiError)', () => {
    it('conserva el código HTTP, el código estable y los datos', async () => {
      fetchSpy.and.resolveTo(respuesta(409, {
        status: 'ERROR',
        msg: 'El envio ya existe pero contiene una cantidad diferente de lecturas.',
        codigo: 'CARGA_EXISTENTE',
        data: { lecturas_servidor: 1, estado: 'RECIBIDO' },
      }));

      const e = await rechazo(() => api.post('x', {})) as ApiError;

      expect(e).toBeInstanceOf(ApiError);
      expect(e.status).toBe(409);
      expect(e.codigo).toBe('CARGA_EXISTENTE');
      expect(e.datos).toEqual({ lecturas_servidor: 1, estado: 'RECIBIDO' });
      expect(e.message).toBe('El envio ya existe pero contiene una cantidad diferente de lecturas.');
    });

    it('sin código ni datos en el cuerpo, quedan en null', async () => {
      fetchSpy.and.resolveTo(respuesta(400, { status: 'ERROR', msg: 'Falta TAG.' }));

      const e = await rechazo(() => api.post('x', {})) as ApiError;

      expect(e.status).toBe(400);
      expect(e.codigo).toBeNull();
      expect(e.datos).toBeNull();
    });

    // Compatibilidad: todo lo que hoy lee err.message sigue funcionando.
    it('sigue siendo un Error con el mensaje del servidor', async () => {
      fetchSpy.and.resolveTo(respuesta(500, { status: 'ERROR', msg: 'No pudimos guardar el TAG.' }));

      const e = await rechazo(() => api.post('x', {}));

      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toBe('No pudimos guardar el TAG.');
    });

    it('también al pedir con GET', async () => {
      fetchSpy.and.resolveTo(respuesta(404, { status: 'ERROR', msg: 'No existe.' }));

      const e = await rechazo(() => api.get('x')) as ApiError;

      expect(e).toBeInstanceOf(ApiError);
      expect(e.status).toBe(404);
    });

    // El servidor SÍ contestó: su mensaje no se reinterpreta como fallo de red.
    for (const palabra of ['timeout', 'network', 'socket', 'failed to fetch']) {
      it(`un mensaje del servidor que contiene "${palabra}" no se convierte en NetworkError`, async () => {
        fetchSpy.and.resolveTo(respuesta(500, { status: 'ERROR', msg: `Error de ${palabra} en la base` }));

        const e = await rechazo(() => api.post('x', {}));

        expect(e).toBeInstanceOf(ApiError);
        expect(e).not.toBeInstanceOf(NetworkError);
      });
    }

    it('un OK sin datos es una respuesta del servidor, marcada aparte', async () => {
      fetchSpy.and.resolveTo(respuesta(200, { status: 'OK', msg: 'OK' }));

      const e = await rechazo(() => api.post('x', {})) as ApiError;

      expect(e).toBeInstanceOf(ApiError);
      expect(e.status).toBe(200);
      expect(e.codigo).toBe('SIN_DATOS');
    });

    it('una respuesta correcta sigue devolviendo sus datos', async () => {
      fetchSpy.and.resolveTo(respuesta(200, { status: 'OK', msg: 'OK', data: { carga_id: 5 } }));

      expect(await api.post('x', {})).toEqual({ carga_id: 5 });
    });
  });

  describe('no hubo respuesta (NetworkError): ¿la solicitud pudo llegar?', () => {
    let enLinea: jasmine.Spy;

    beforeEach(() => {
      enLinea = spyOnProperty(navigator, 'onLine', 'get').and.returnValue(true);
    });

    it('con red al fallar, se asume que pudo llegar', async () => {
      fetchSpy.and.rejectWith(new TypeError('Failed to fetch'));

      const e = await rechazo(() => api.post('x', {})) as NetworkError;

      expect(e).toBeInstanceOf(NetworkError);
      expect(e.solicitudEnviada).toBeTrue();
    });

    it('sin red al fallar, la solicitud NO salió', async () => {
      enLinea.and.returnValue(false);
      fetchSpy.and.rejectWith(new TypeError('Failed to fetch'));

      const e = await rechazo(() => api.post('x', {})) as NetworkError;

      expect(e.solicitudEnviada).toBeFalse();
    });

    it('un error no reconocido sin red tampoco salió', async () => {
      enLinea.and.returnValue(false);
      fetchSpy.and.rejectWith('algo raro');

      const e = await rechazo(() => api.post('x', {})) as NetworkError;

      expect(e.solicitudEnviada).toBeFalse();
    });

    // Se esperó una respuesta que no llegó: la solicitud salió, haya o no red ahora.
    it('un timeout siempre cuenta como enviada, aunque ahora no haya red', async () => {
      enLinea.and.returnValue(false);
      const timeout = new Error('signal timed out');
      timeout.name = 'TimeoutError';
      fetchSpy.and.rejectWith(timeout);

      const e = await rechazo(() => api.post('x', {})) as NetworkError;

      expect(e.solicitudEnviada).toBeTrue();
    });

    it('una cancelación manual cuenta como enviada: pudo haber llegado', async () => {
      const abort = new Error('aborted');
      abort.name = 'AbortError';
      fetchSpy.and.rejectWith(abort);

      const e = await rechazo(() => api.post('x', {})) as NetworkError;

      expect(e.solicitudEnviada).toBeTrue();
    });

    it('un cuerpo que llegó incompleto cuenta como enviado', async () => {
      fetchSpy.and.resolveTo({
        ok: true, status: 200, headers: new Headers(),
        text: () => Promise.resolve('{"status":"OK","msg":"TAG rec'),
      } as Response);

      const e = await rechazo(() => api.post('x', {})) as NetworkError;

      expect(e).toBeInstanceOf(NetworkError);
      expect(e.solicitudEnviada).toBeTrue();
    });

    /*
     * Cuidado deliberado: se mira DESPUÉS de fallar, no antes de mandar. Si el
     * navegador dijera "sin red" y estuviera equivocado, bloquear el envío
     * dejaría a la PDA sin poder subir nada.
     */
    it('estando sin red según el navegador, igual intenta mandar', async () => {
      enLinea.and.returnValue(false);
      fetchSpy.and.resolveTo(respuesta(200, { status: 'OK', msg: 'OK', data: { ok: true } }));

      expect(await api.post('x', {})).toEqual({ ok: true });
      expect(fetchSpy).toHaveBeenCalled();
    });
  });
});
