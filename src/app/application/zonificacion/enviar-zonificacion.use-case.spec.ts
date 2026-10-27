import { TestBed } from '@angular/core/testing';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_SCHEMA_SQL } from '../../core/database/sodimac.schema';
import { SqliteZonificacionRepository } from '../../data/zonificacion/zonificacion-local.repository';
import { GUARDAR_APLICADA_V1_DATA, ESTADO_V1_DATA } from '../../data/zonificacion/zonificacion.fixtures';
import { RespuestaZonificacionInvalida, parsearRespuestaEstado, parsearResultadoOperacion } from '../../data/zonificacion/zonificacion.parser';
import { ApiError } from '../../domain/shared/errors/api.error';
import { NetworkError } from '../../domain/shared/errors/network.error';
import { ResultadoOperacion } from '../../domain/zonificacion/models/operacion-zonificacion.model';
import { ZONIFICACION_API_REPOSITORY_TOKEN, ZonificacionApiRepository } from '../../domain/zonificacion/repositories/zonificacion-api.repository';
import { NuevaOperacion, ZONIFICACION_LOCAL_REPOSITORY_TOKEN } from '../../domain/zonificacion/repositories/zonificacion-local.repository';
import { ConexionFalsa, crearConexionEnMemoria } from '../../../testing/sqlite-en-memoria';
import { EnviarZonificacionUseCase } from './enviar-zonificacion.use-case';
import { IdentidadZonificacionService } from './identidad-zonificacion.service';

const op = (uid: string, extra: Partial<NuevaOperacion> = {}): NuevaOperacion => ({
  operacionUid: uid,
  idAgenda: 3120,
  numeroAgenda: 'AG-1',
  tipo: 'GUARDAR_RANGO',
  claveRango: null,
  datos: { codigo_zona: 'ALTILLO', tag_desde: 1135, tag_hasta: 1140 },
  operadorLogin: 'op@taxo.cl',
  operadorRut: '199955349',
  fechaHoraLocal: '2026-10-23 10:00:00',
  ...extra,
});

const rechazo = (codigo: string, status = 409) => new ApiError(`Rechazado: ${codigo}`, status, codigo, { campo: 'x' });

describe('EnviarZonificacionUseCase', () => {
  let db: ConexionFalsa;
  let local: SqliteZonificacionRepository;
  let api: jasmine.SpyObj<ZonificacionApiRepository>;
  let identidad: jasmine.SpyObj<IdentidadZonificacionService>;
  let uc: EnviarZonificacionUseCase;
  const aplicada = (extra: Partial<ResultadoOperacion> = {}): ResultadoOperacion => ({ ...parsearResultadoOperacion(GUARDAR_APLICADA_V1_DATA), ...extra });

  beforeEach(async () => {
    db = await crearConexionEnMemoria(SODIMAC_SCHEMA_SQL);
    api = jasmine.createSpyObj<ZonificacionApiRepository>('Api', ['obtenerCatalogo', 'listarAgendas', 'obtenerEstado', 'enviar']);
    api.enviar.and.callFake(async (s) => aplicada({ operacionUid: s.operacionUid }));
    api.obtenerEstado.and.resolveTo(parsearRespuestaEstado(ESTADO_V1_DATA));
    identidad = jasmine.createSpyObj<IdentidadZonificacionService>('Identidad', ['obtener']);
    identidad.obtener.and.resolveTo({ operadorLogin: 'otro@taxo.cl', operadorRut: '1', pdaCodigo: 'PDA-9', versionApp: '1.0.17' });

    TestBed.configureTestingModule({
      providers: [
        EnviarZonificacionUseCase,
        SqliteZonificacionRepository,
        SqliteConnectionService,
        { provide: ZONIFICACION_API_REPOSITORY_TOKEN, useValue: api },
        { provide: ZONIFICACION_LOCAL_REPOSITORY_TOKEN, useExisting: SqliteZonificacionRepository },
        { provide: IdentidadZonificacionService, useValue: identidad },
      ],
    });
    spyOn(TestBed.inject(SqliteConnectionService), 'getConnection').and.resolveTo(db as never);
    local = TestBed.inject(SqliteZonificacionRepository);
    uc = TestBed.inject(EnviarZonificacionUseCase);
  });

  afterEach(() => db?.cerrar());

  describe('lo que sale bien', () => {
    it('una operación aplicada sale de la cola y su estado queda guardado', async () => {
      await local.encolar(op('a'));

      const r = await uc.execute();

      expect(r).toEqual({ enviadas: 1, rechazadas: 0, reintentables: 0, cortadoPorRed: false });
      expect(await local.contarPendientes()).toBe(0);
      expect((await local.obtenerEstado(2092))?.valor.agenda.numeroAgenda).toBe('AG-20260909-4081-01');
    });

    it('YA_APLICADA (un reintento tras perder la respuesta) también sale de la cola', async () => {
      api.enviar.and.resolveTo(aplicada({ resultado: 'YA_APLICADA' }));
      await local.encolar(op('a'));

      const r = await uc.execute();

      expect(r.enviadas).toBe(1);
      expect(await local.contarPendientes()).toBe(0);
    });

    it('sin nada pendiente no llama al servidor', async () => {
      const r = await uc.execute();
      expect(r).toEqual({ enviadas: 0, rechazadas: 0, reintentables: 0, cortadoPorRed: false });
      expect(api.enviar).not.toHaveBeenCalled();
    });

    it('manda cada operación con su uid, su contenido y la identidad de quien la hizo', async () => {
      await local.encolar(op('a', { tipo: 'ANULAR_TAG', datos: { numero_tag: 1133, motivo: 'etiqueta rota' } }));

      await uc.execute();

      expect(api.enviar).toHaveBeenCalledOnceWith({
        operacionUid: 'a',
        tipo: 'ANULAR_TAG',
        idAgenda: 3120,
        numeroAgenda: 'AG-1',
        datos: { numero_tag: 1133, motivo: 'etiqueta rota' },
        fechaHoraLocal: '2026-10-23 10:00:00',
        // quien hizo la acción, aunque ahora haya otra sesión; la PDA y la versión son las actuales
        identidad: { operadorLogin: 'op@taxo.cl', operadorRut: '199955349', pdaCodigo: 'PDA-9', versionApp: '1.0.17' },
      });
    });
  });

  describe('el orden', () => {
    it('sale en el orden en que se hizo y de a una: la siguiente espera a que la anterior termine', async () => {
      await local.encolar(op('a'));
      await local.encolar(op('b'));
      await local.encolar(op('c'));
      const enVuelo: string[] = [];
      let maxSimultaneas = 0;
      api.enviar.and.callFake(async (s) => {
        enVuelo.push(s.operacionUid);
        maxSimultaneas = Math.max(maxSimultaneas, enVuelo.length);
        await Promise.resolve();
        enVuelo.splice(enVuelo.indexOf(s.operacionUid), 1);
        return aplicada({ operacionUid: s.operacionUid });
      });

      await uc.execute();

      expect(api.enviar.calls.allArgs().map((a) => a[0].operacionUid)).toEqual(['a', 'b', 'c']);
      expect(maxSimultaneas).toBe(1);
    });

    it('un fallo transitorio detiene la cola de esa agenda: lo que sigue no sale antes', async () => {
      await local.encolar(op('a'));
      await local.encolar(op('b', { tipo: 'CONFIRMAR', datos: {} }));
      api.enviar.and.rejectWith(new ApiError('Error del servidor', 500, 'ERROR_INTERNO'));

      const r = await uc.execute();

      expect(api.enviar).toHaveBeenCalledTimes(1);
      expect(r).toEqual({ enviadas: 0, rechazadas: 0, reintentables: 2, cortadoPorRed: false });
      expect((await local.listarPendientes()).map((x) => x.operacionUid)).toEqual(['a', 'b']);
    });

    it('el fallo de una agenda no frena a las demás', async () => {
      await local.encolar(op('a'));
      await local.encolar(op('b', { idAgenda: 3151, numeroAgenda: 'AG-2' }));
      api.enviar.and.callFake(async (s) => {
        if (s.idAgenda === 3120) throw new ApiError('Ocupada', 503, 'ZONIFICACION_OCUPADA');
        return aplicada({ operacionUid: s.operacionUid });
      });

      const r = await uc.execute();

      expect(r.enviadas).toBe(1);
      expect(r.reintentables).toBe(1);
      expect((await local.listarPendientes()).map((x) => x.operacionUid)).toEqual(['a']);
    });

    it('puede enviarse solo una agenda', async () => {
      await local.encolar(op('a'));
      await local.encolar(op('b', { idAgenda: 3151, numeroAgenda: 'AG-2' }));

      await uc.execute({ idAgenda: 3151 });

      expect(api.enviar.calls.allArgs().map((a) => a[0].operacionUid)).toEqual(['b']);
      expect((await local.listarPendientes()).map((x) => x.operacionUid)).toEqual(['a']);
    });
  });

  describe('lo que el operador hace mientras se envía', () => {
    it('lo que se encola durante el envío sale en la misma tanda, sin esperar al próximo disparador', async () => {
      await local.encolar(op('a'));
      api.enviar.and.callFake(async (s) => {
        if (s.operacionUid === 'a') await local.encolar(op('b'));
        return aplicada({ operacionUid: s.operacionUid });
      });

      const r = await uc.execute();

      expect(api.enviar.calls.allArgs().map((a) => a[0].operacionUid)).toEqual(['a', 'b']);
      expect(r.enviadas).toBe(2);
      expect(await local.contarPendientes()).toBe(0);
    });

    it('se manda el contenido vigente: si la operación se editó antes de tomar el turno, sale la versión nueva', async () => {
      const a = await local.encolar(op('a'));
      await local.actualizarDatos(a.id, { codigo_zona: 'ALTILLO', tag_desde: 1135, tag_hasta: 1145 });

      await uc.execute();

      expect(api.enviar.calls.mostRecent().args[0].datos['tag_hasta']).toBe(1145);
    });
  });

  describe('los errores', () => {
    it('un rechazo definitivo queda RECHAZADA con su código y no se reintenta', async () => {
      await local.encolar(op('a'));
      api.enviar.and.rejectWith(rechazo('RANGO_CRUZADO'));

      const r = await uc.execute();

      expect(r).toEqual({ enviadas: 0, rechazadas: 1, reintentables: 0, cortadoPorRed: false });
      const rechazada = (await local.listarRechazadas())[0];
      expect(rechazada.error).toEqual({ codigo: 'RANGO_CRUZADO', data: { campo: 'x' } });
      expect(rechazada.mensajeError).toBe('Rechazado: RANGO_CRUZADO');
      expect(await local.contarPendientes()).toBe(0);

      await uc.execute();
      expect(api.enviar).toHaveBeenCalledTimes(1);
    });

    it('tras un rechazo la cola sigue con la que viene', async () => {
      await local.encolar(op('a'));
      await local.encolar(op('b'));
      api.enviar.and.callFake(async (s) => {
        if (s.operacionUid === 'a') throw rechazo('RANGO_CRUZADO');
        return aplicada({ operacionUid: s.operacionUid });
      });

      const r = await uc.execute();

      expect(r).toEqual({ enviadas: 1, rechazadas: 1, reintentables: 0, cortadoPorRed: false });
    });

    it('tras un rechazo se vuelve a pedir el estado de la agenda (pudo cambiar en el servidor)', async () => {
      await local.encolar(op('a'));
      api.enviar.and.rejectWith(rechazo('ZONIFICACION_CONFIRMADA'));

      await uc.execute();

      expect(api.obtenerEstado).toHaveBeenCalledOnceWith(
        { operadorLogin: 'op@taxo.cl', operadorRut: '199955349', pdaCodigo: 'PDA-9', versionApp: '1.0.17' },
        3120,
        'AG-1',
      );
      expect(await local.obtenerEstado(2092)).not.toBeNull();
    });

    it('avisa del cambio otra vez cuando ya trajo el estado nuevo, para que las pantallas lo muestren', async () => {
      await local.encolar(op('a'));
      api.enviar.and.rejectWith(rechazo('RANGO_CRUZADO'));
      const avisos: number[] = [];
      api.obtenerEstado.and.callFake(async () => {
        avisos.push(uc.cambios()); // al pedir el estado, solo se avisó del rechazo
        return parsearRespuestaEstado(ESTADO_V1_DATA);
      });

      await uc.execute();

      expect(avisos).toEqual([1]);
      expect(uc.cambios()).toBe(2); // y después, con el estado ya guardado
    });

    it('si el estado no se puede refrescar, el rechazo igual queda registrado', async () => {
      await local.encolar(op('a'));
      api.enviar.and.rejectWith(rechazo('ZONIFICACION_CONFIRMADA'));
      api.obtenerEstado.and.rejectWith(new NetworkError('sin red'));
      spyOn(console, 'error');

      const r = await uc.execute();

      expect(r.rechazadas).toBe(1);
    });

    it('no hay respuesta (sin red): sigue PENDIENTE y cuenta el intento', async () => {
      await local.encolar(op('a'));
      api.enviar.and.rejectWith(new NetworkError('Sin conexión', true, false));

      const r = await uc.execute();

      expect(r.reintentables).toBe(1);
      const pendiente = (await local.listarPendientes())[0];
      expect(pendiente.estado).toBe('PENDIENTE');
      expect(pendiente.intentos).toBe(1);
    });

    it('un timeout (pudo haber llegado) se reintenta con el MISMO uid y el mismo contenido', async () => {
      await local.encolar(op('a'));
      api.enviar.and.rejectWith(new NetworkError('No respondió a tiempo', true, true));
      await uc.execute();
      api.enviar.and.callFake(async (s) => aplicada({ operacionUid: s.operacionUid, resultado: 'YA_APLICADA' }));

      await uc.execute();

      const [primero, segundo] = api.enviar.calls.allArgs().map((a) => a[0]);
      expect(segundo).toEqual(primero);
      expect(await local.contarPendientes()).toBe(0);
    });

    it('una respuesta que no se entiende se trata como transitoria: puede haberse aplicado', async () => {
      await local.encolar(op('a'));
      api.enviar.and.rejectWith(new RespuestaZonificacionInvalida('falta resumen'));

      const r = await uc.execute();

      expect(r.reintentables).toBe(1);
      expect((await local.listarPendientes()).length).toBe(1);
    });

    it('un código que la app no conoce se reintenta, no se descarta', async () => {
      await local.encolar(op('a'));
      api.enviar.and.rejectWith(new ApiError('Algo nuevo', 409, 'CODIGO_DEL_FUTURO'));

      const r = await uc.execute();

      expect(r.rechazadas).toBe(0);
      expect(r.reintentables).toBe(1);
    });

    it('un error del servidor sin código (500) se reintenta', async () => {
      await local.encolar(op('a'));
      api.enviar.and.rejectWith(new ApiError('Error', 500));

      expect((await uc.execute()).reintentables).toBe(1);
    });
  });

  describe('cuidar la batería', () => {
    it('con cortarAlFalloDeRed, el primer fallo de red corta la tanda sin probar las demás agendas', async () => {
      await local.encolar(op('a'));
      await local.encolar(op('b', { idAgenda: 3151, numeroAgenda: 'AG-2' }));
      api.enviar.and.rejectWith(new NetworkError('Sin conexión', true, false));

      const r = await uc.execute({ cortarAlFalloDeRed: true });

      expect(api.enviar).toHaveBeenCalledTimes(1);
      expect(r.cortadoPorRed).toBeTrue();
    });

    it('sin esa opción, un fallo de red en una agenda no impide probar las otras', async () => {
      await local.encolar(op('a'));
      await local.encolar(op('b', { idAgenda: 3151, numeroAgenda: 'AG-2' }));
      api.enviar.and.rejectWith(new NetworkError('Sin conexión', true, false));

      const r = await uc.execute();

      expect(api.enviar).toHaveBeenCalledTimes(2);
      expect(r.cortadoPorRed).toBeFalse();
    });
  });

  describe('sin sesión y a la vez', () => {
    it('sin sesión o sin PDA no se envía nada y todo sigue esperando', async () => {
      identidad.obtener.and.resolveTo(null);
      await local.encolar(op('a'));

      const r = await uc.execute();

      expect(api.enviar).not.toHaveBeenCalled();
      expect(r.reintentables).toBe(1);
      expect(await local.contarPendientes()).toBe(1);
    });

    it('dos envíos a la vez de la misma agenda no mandan la misma operación dos veces', async () => {
      await local.encolar(op('a'));
      let liberar!: () => void;
      api.enviar.and.callFake(
        (s) => new Promise<ResultadoOperacion>((ok) => { liberar = () => ok(aplicada({ operacionUid: s.operacionUid })); }),
      );

      const primero = uc.execute();
      await new Promise((r) => setTimeout(r));
      const segundo = await uc.execute();
      liberar();
      await primero;

      expect(api.enviar).toHaveBeenCalledTimes(1);
      expect(segundo.enviadas).toBe(0);
    });
  });
});
