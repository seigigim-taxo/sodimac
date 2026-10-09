import { TestBed } from '@angular/core/testing';
import { EstadoCargasApiService } from './estado-cargas-api.service';
import { ApiService } from '../../core/http/api.service';
import { ApiError } from '../../domain/shared/errors/api.error';
import { NetworkError } from '../../domain/shared/errors/network.error';
import { environment } from '../../../environments/environment';

/*
 * La pregunta "¿recibiste este envío?". De su respuesta depende si un TAG vuelve
 * a ser editable o queda bloqueado, así que la regla central es: solo se afirma
 * lo que el servidor dijo EXPLÍCITAMENTE. Un uid que falta en la respuesta es
 * "no se pudo saber", nunca "no existe".
 */
describe('EstadoCargasApiService', () => {
  let servicio: EstadoCargasApiService;
  let api: jasmine.SpyObj<ApiService>;

  const carga = (uid: string, extra: Record<string, unknown> = {}) => ({
    carga_uid: uid, existe: true, estado: 'RECIBIDO', total_lecturas: 14, total_unidades: 101,
    codigo_tienda: '4093', tag_codigo: '7001', iteracion: 1, numero_agenda: 'AG-1', ...extra,
  });

  /* Lo que el cliente entrega para una carga() sin cambios. */
  const IDENTIDAD = { codigoTienda: '4093', tagCodigo: '7001', iteracion: 1, numeroAgenda: 'AG-1' };
  const SIN_IDENTIDAD = { codigoTienda: null, tagCodigo: null, iteracion: null, numeroAgenda: null };

  beforeEach(() => {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['post']);
    api.post.and.resolveTo({ cargas: [] } as never);

    TestBed.configureTestingModule({
      providers: [EstadoCargasApiService, { provide: ApiService, useValue: api }],
    });
    servicio = TestBed.inject(EstadoCargasApiService);
  });

  describe('la consulta', () => {
    it('va al endpoint de consulta con la lista de uids y un tiempo de espera corto', async () => {
      await servicio.consultar(['A', 'B']);

      expect(api.post).toHaveBeenCalledOnceWith(
        environment.estadoCargasEndpoint,
        { carga_uids: ['A', 'B'] },
        { timeoutMs: 10_000 },
      );
    });

    it('sin uids no llama al servidor', async () => {
      expect(await servicio.consultar([])).toEqual([]);
      expect(api.post).not.toHaveBeenCalled();
    });

    it('descarta uids vacíos y repetidos', async () => {
      await servicio.consultar(['A', '', '  ', 'A', 'B']);

      expect(api.post.calls.mostRecent().args[1]).toEqual({ carga_uids: ['A', 'B'] });
    });

    it('parte una lista larga en tandas de 100 y junta las respuestas', async () => {
      const uids = Array.from({ length: 250 }, (_, i) => `U${i}`);
      api.post.and.callFake((async (_: string, body: { carga_uids: string[] }) => ({
        cargas: body.carga_uids.map((u) => carga(u)),
      })) as never);

      const r = await servicio.consultar(uids);

      expect(api.post).toHaveBeenCalledTimes(3);
      expect(api.post.calls.allArgs().map((a) => (a[1] as { carga_uids: string[] }).carga_uids.length)).toEqual([100, 100, 50]);
      expect(r.length).toBe(250);
    });
  });

  describe('lo que dice el servidor', () => {
    it('un envío que existe trae su estado y sus totales', async () => {
      api.post.and.resolveTo({ cargas: [carga('A', { estado: 'PROCESADO', total_lecturas: 3, total_unidades: 101 })] } as never);

      expect(await servicio.consultar(['A'])).toEqual([
        { cargaUid: 'A', existe: true, estado: 'PROCESADO', totalLecturas: 3, totalUnidades: 101, ...IDENTIDAD },
      ]);
    });

    it('uno que no existe no trae estado ni totales', async () => {
      api.post.and.resolveTo({ cargas: [{ carga_uid: 'A', existe: false, estado: 'RECIBIDO', total_lecturas: 9 }] } as never);

      expect(await servicio.consultar(['A'])).toEqual([
        { cargaUid: 'A', existe: false, estado: null, totalLecturas: null, totalUnidades: null, ...SIN_IDENTIDAD },
      ]);
    });

    it('los números que llegan como texto se leen igual (MySQL devuelve DECIMAL como string)', async () => {
      api.post.and.resolveTo({ cargas: [carga('A', { total_lecturas: '14', total_unidades: '101.500' })] } as never);

      const [r] = await servicio.consultar(['A']);

      expect(r.totalLecturas).toBe(14);
      expect(r.totalUnidades).toBe(101.5);
    });

    it('un estado que no se conoce queda en null, pero el envío sigue existiendo', async () => {
      api.post.and.resolveTo({ cargas: [carga('A', { estado: 'RARO' })] } as never);

      const [r] = await servicio.consultar(['A']);

      expect(r.existe).toBeTrue();
      expect(r.estado).toBeNull();
    });

    describe('la identidad del envío', () => {
      it('trae tienda, TAG, iteración y agenda', async () => {
        api.post.and.resolveTo({ cargas: [carga('A')] } as never);

        const [r] = await servicio.consultar(['A']);

        expect({ t: r.codigoTienda, g: r.tagCodigo, i: r.iteracion, a: r.numeroAgenda })
          .toEqual({ t: '4093', g: '7001', i: 1, a: 'AG-1' });
      });

      it('un dato que el servidor no informó queda en null, sin romper el resto', async () => {
        api.post.and.resolveTo({ cargas: [carga('A', { numero_agenda: null, tag_codigo: '' })] } as never);

        const [r] = await servicio.consultar(['A']);

        expect(r.numeroAgenda).toBeNull();
        expect(r.tagCodigo).toBeNull();
        expect(r.existe).toBeTrue();
        expect(r.codigoTienda).toBe('4093');
      });

      it('un TAG que llega como número se lee como texto', async () => {
        api.post.and.resolveTo({ cargas: [carga('A', { tag_codigo: 7001 })] } as never);

        expect((await servicio.consultar(['A']))[0].tagCodigo).toBe('7001');
      });

      it('la iteración que llega como texto se lee como número', async () => {
        api.post.and.resolveTo({ cargas: [carga('A', { iteracion: '2' })] } as never);

        expect((await servicio.consultar(['A']))[0].iteracion).toBe(2);
      });

      it('un envío que no existe no trae identidad aunque el servidor mande datos', async () => {
        api.post.and.resolveTo({ cargas: [{ carga_uid: 'A', existe: false, tag_codigo: '9999', codigo_tienda: '1' }] } as never);

        expect(await servicio.consultar(['A'])).toEqual([
          { cargaUid: 'A', existe: false, estado: null, totalLecturas: null, totalUnidades: null, ...SIN_IDENTIDAD },
        ]);
      });
    });

    it('un total que no es número queda en null', async () => {
      api.post.and.resolveTo({ cargas: [carga('A', { total_lecturas: 'x', total_unidades: null })] } as never);

      const [r] = await servicio.consultar(['A']);

      expect(r.totalLecturas).toBeNull();
      expect(r.totalUnidades).toBeNull();
    });
  });

  /*
   * LA REGLA: un uid que el servidor no menciona NO se devuelve. Devolverlo como
   * "no existe" haría volver editable un TAG que el servidor quizá sí tiene.
   */
  describe('lo que NO afirma', () => {
    it('un uid que falta en la respuesta no aparece', async () => {
      api.post.and.resolveTo({ cargas: [carga('A')] } as never);

      const r = await servicio.consultar(['A', 'B']);

      expect(r.map((c) => c.cargaUid)).toEqual(['A']);
    });

    it('ignora respuestas de uids que no se pidieron', async () => {
      api.post.and.resolveTo({ cargas: [carga('A'), carga('AJENO')] } as never);

      expect((await servicio.consultar(['A'])).map((c) => c.cargaUid)).toEqual(['A']);
    });

    it('ignora entradas sin un "existe" explícito', async () => {
      api.post.and.resolveTo({ cargas: [{ carga_uid: 'A' }, { carga_uid: 'B', existe: 'si' }, carga('C')] } as never);

      expect((await servicio.consultar(['A', 'B', 'C'])).map((c) => c.cargaUid)).toEqual(['C']);
    });

    it('una respuesta sin lista de cargas es una respuesta vacía, no un error', async () => {
      api.post.and.resolveTo({} as never);

      expect(await servicio.consultar(['A'])).toEqual([]);
    });

    it('una respuesta que no es un objeto tampoco rompe', async () => {
      api.post.and.resolveTo(null as never);

      expect(await servicio.consultar(['A'])).toEqual([]);
    });
  });

  /*
   * La respuesta REAL del servidor de producción, capturada el 8 de octubre de
   * 2026 consultando el primer envío del TAG 7001 (el que llegó al servidor y
   * cuya respuesta se perdió) junto a un uid que no existe. Ata al cliente con
   * lo que el backend de verdad devuelve, y no solo con lo que el spec imagina.
   */
  describe('contra una respuesta real de producción', () => {
    const UID_7001 = '4093-20261005-ITER1-7001-OTRO-3fd5cc2547caa760-20261005101938378';

    const RESPUESTA_REAL = {
      version: 1,
      cargas: [
        { carga_uid: 'PRUEBA-NO-EXISTE', existe: false },
        {
          carga_uid: UID_7001,
          existe: true,
          estado: 'PROCESADO',
          carga_id: 19958,
          total_productos: 1,
          total_lecturas: 1,
          total_unidades: 30,
          codigo_tienda: '4093',
          tag_codigo: '7001',
          iteracion: 1,
          numero_agenda: 'AG-20261005-4093-01',
          fecha_recepcion: '2026-10-05 10:19:41',
          fecha_procesado: '2026-10-05 10:19:43',
        },
      ],
    };

    it('lo interpreta completo', async () => {
      api.post.and.resolveTo(RESPUESTA_REAL as never);

      expect(await servicio.consultar(['PRUEBA-NO-EXISTE', UID_7001])).toEqual([
        { cargaUid: 'PRUEBA-NO-EXISTE', existe: false, estado: null, totalLecturas: null, totalUnidades: null, ...SIN_IDENTIDAD },
        {
          cargaUid: UID_7001, existe: true, estado: 'PROCESADO', totalLecturas: 1, totalUnidades: 30,
          codigoTienda: '4093', tagCodigo: '7001', iteracion: 1, numeroAgenda: 'AG-20261005-4093-01',
        },
      ]);
    });

    // El caso que originó todo: el servidor lo tiene, ya procesado, y la PDA no se enteró.
    it('el envío del TAG 7001 figura como recibido y procesado', async () => {
      api.post.and.resolveTo(RESPUESTA_REAL as never);

      const [, c7001] = await servicio.consultar(['PRUEBA-NO-EXISTE', UID_7001]);

      expect(c7001.existe).toBeTrue();
      expect(c7001.estado).toBe('PROCESADO');
    });
  });

  describe('cuando la consulta falla', () => {
    it('un error de red sube tal cual', async () => {
      api.post.and.rejectWith(new NetworkError('Sin conexión con el servidor.'));

      await expectAsync(servicio.consultar(['A'])).toBeRejectedWithError(NetworkError);
    });

    // Con el endpoint todavía sin desplegar, quien consulta tiene que poder
    // reconocerlo para caer al reenvío idéntico.
    it('un 404 sube como ApiError, con su código', async () => {
      api.post.and.rejectWith(new ApiError('No encontrado', 404));

      const e = await servicio.consultar(['A']).catch((err) => err) as ApiError;

      expect(e).toBeInstanceOf(ApiError);
      expect(e.status).toBe(404);
    });

    it('si una tanda falla, la consulta entera falla: no devuelve respuestas a medias', async () => {
      const uids = Array.from({ length: 150 }, (_, i) => `U${i}`);
      api.post.and.callFake((async (_: string, body: { carga_uids: string[] }) => {
        if (body.carga_uids[0] === 'U100') throw new NetworkError('cortado');
        return { cargas: body.carga_uids.map((u) => carga(u)) };
      }) as never);

      await expectAsync(servicio.consultar(uids)).toBeRejectedWithError(NetworkError);
    });
  });
});
