import { TestBed } from '@angular/core/testing';
import { ReconciliarEnviosUseCase } from './reconciliar-envios.use-case';
import { ResolverEnvioUseCase } from './resolver-envio.use-case';
import { SINCRONIZACION_REPOSITORY_TOKEN, SincronizacionRepository } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { CONTEO_REPOSITORY_TOKEN, ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { ESTADO_CARGAS_API_REPOSITORY_TOKEN, EstadoCargaServidor, EstadoCargasApiRepository } from '../../domain/sincronizacion/repositories/estado-cargas-api.repository';
import { SincronizacionSync } from '../../domain/sincronizacion/models/sincronizacion-sync.model';
import { ApiService } from '../../core/http/api.service';
import { ApiError } from '../../domain/shared/errors/api.error';
import { NetworkError } from '../../domain/shared/errors/network.error';

/*
 * La reconciliación en lote: preguntarle al servidor, de una vez, por todos los
 * envíos que la PDA figura como pendientes. Es lo que hace que la PDA se entere
 * de un TAG que el servidor ya guardó.
 *
 * Usa el ResolverEnvioUseCase real, no uno doblado: lo que importa probar es el
 * conjunto — qué queda anotado y qué se marca — y no solo que se lo llame.
 */
const payload = (uid: string, lecturas = 3) => JSON.stringify({
  carga_uid: uid, codigo_tienda: '4093', tag_codigo: '7001', iteracion: 1, numero_agenda: 'AG-1',
  detalles: [{ sku: 'A', lecturas: Array.from({ length: lecturas }, (_, i) => ({ lectura_uid: `${uid}-L${i}` })) }],
});

const fila = (uid: string, extra: Partial<SincronizacionSync> = {}): SincronizacionSync => ({
  id: 1, eventoId: 10, pdaId: 1, tipo: 'CARGA_DESDE_PDA', operacion: 'TAG_FINALIZADO',
  perfil: 'OPERADOR', iteracion: 1, conteoId: 10, ubicacionId: 228, operadorId: 1,
  cargaUid: uid, payloadJson: payload(uid), estado: 'PENDIENTE', error: null, intentos: 1,
  fechaHora: '2026-10-05 10:19:38', fechaUltimoIntento: null, fechaEnvio: null, registrosProcesados: null,
  ...extra,
});

const servidor = (uid: string, extra: Partial<EstadoCargaServidor> = {}): EstadoCargaServidor => ({
  cargaUid: uid, existe: true, estado: 'PROCESADO', totalLecturas: 3, totalUnidades: 3,
  codigoTienda: '4093', tagCodigo: '7001', iteracion: 1, numeroAgenda: 'AG-1',
  ...extra,
});

const noExiste = (uid: string): EstadoCargaServidor => servidor(uid, {
  existe: false, estado: null, totalLecturas: null, totalUnidades: null,
  codigoTienda: null, tagCodigo: null, iteracion: null, numeroAgenda: null,
});

describe('ReconciliarEnviosUseCase', () => {
  let useCase: ReconciliarEnviosUseCase;
  let repo: jasmine.SpyObj<SincronizacionRepository>;
  let conteoRepo: jasmine.SpyObj<ConteoRepository>;
  let estadoApi: jasmine.SpyObj<EstadoCargasApiRepository>;

  beforeEach(() => {
    repo = jasmine.createSpyObj<SincronizacionRepository>('SincronizacionRepository', [
      'listarPendientes', 'marcarEnviado', 'marcarEnviadoConDiferencias', 'marcarError', 'marcarSinRespuesta',
    ]);
    repo.listarPendientes.and.resolveTo([]);
    repo.marcarEnviado.and.resolveTo();
    repo.marcarEnviadoConDiferencias.and.resolveTo();
    repo.marcarError.and.resolveTo();
    repo.marcarSinRespuesta.and.resolveTo();

    conteoRepo = jasmine.createSpyObj<ConteoRepository>('ConteoRepository', ['marcarSincronizado']);
    conteoRepo.marcarSincronizado.and.resolveTo();

    estadoApi = jasmine.createSpyObj<EstadoCargasApiRepository>('EstadoCargasApiRepository', ['consultar']);
    estadoApi.consultar.and.resolveTo([]);

    TestBed.configureTestingModule({
      providers: [
        ReconciliarEnviosUseCase,
        ResolverEnvioUseCase,
        { provide: SINCRONIZACION_REPOSITORY_TOKEN, useValue: repo },
        { provide: CONTEO_REPOSITORY_TOKEN, useValue: conteoRepo },
        { provide: ESTADO_CARGAS_API_REPOSITORY_TOKEN, useValue: estadoApi },
        { provide: ApiService, useValue: jasmine.createSpyObj<ApiService>('ApiService', ['post']) },
      ],
    });
    useCase = TestBed.inject(ReconciliarEnviosUseCase);
  });

  const vacio = { total: 0, confirmados: 0, conDiferencias: 0, noRecibidos: 0, conflictos: 0, sinRespuesta: 0, consultaNoDisponible: false };

  describe('qué consulta', () => {
    it('sin pendientes no consulta nada', async () => {
      expect(await useCase.execute()).toEqual(vacio);
      expect(estadoApi.consultar).not.toHaveBeenCalled();
    });

    it('pregunta por todos los pendientes en UNA sola consulta', async () => {
      repo.listarPendientes.and.resolveTo([fila('A'), fila('B', { estado: 'ERROR' }), fila('C')]);

      await useCase.execute();

      expect(estadoApi.consultar).toHaveBeenCalledOnceWith(['A', 'B', 'C']);
    });

    it('solo los envíos de TAG: ignora las validaciones del analista y las filas sin uid', async () => {
      repo.listarPendientes.and.resolveTo([
        fila('A'),
        fila('VAL', { operacion: 'VALIDACION_OPERACIONAL', perfil: 'ANALISTA_CLIENTE' }),
        fila('X', { cargaUid: null }),
      ]);

      const r = await useCase.execute();

      expect(estadoApi.consultar).toHaveBeenCalledOnceWith(['A']);
      expect(r.total).toBe(1);
    });
  });

  describe('el servidor ya los tiene (la PDA no se había enterado)', () => {
    beforeEach(() => repo.listarPendientes.and.resolveTo([fila('A')]));

    it('lo anota como enviado y marca el TAG como sincronizado', async () => {
      estadoApi.consultar.and.resolveTo([servidor('A')]);

      const r = await useCase.execute();

      expect(r.confirmados).toBe(1);
      expect(repo.marcarEnviado).toHaveBeenCalledOnceWith('A', 1);
      expect(conteoRepo.marcarSincronizado).toHaveBeenCalledOnceWith(10, 228, 1, 1);
    });

    it('lo mismo si el servidor ya lo había procesado', async () => {
      estadoApi.consultar.and.resolveTo([servidor('A', { estado: 'PROCESADO' })]);

      expect((await useCase.execute()).confirmados).toBe(1);
    });

    it('con otro contenido: confirmado, y se cuenta aparte', async () => {
      estadoApi.consultar.and.resolveTo([servidor('A', { totalLecturas: 1 })]);

      const r = await useCase.execute();

      expect(r.confirmados).toBe(1);
      expect(r.conDiferencias).toBe(1);
      expect(repo.marcarEnviadoConDiferencias).toHaveBeenCalled();
      expect(conteoRepo.marcarSincronizado).toHaveBeenCalled();
    });

    it('un envío del analista queda enviado pero no marca ningún conteo', async () => {
      repo.listarPendientes.and.resolveTo([fila('A', { perfil: 'ANALISTA_CLIENTE' })]);
      estadoApi.consultar.and.resolveTo([servidor('A')]);

      await useCase.execute();

      expect(repo.marcarEnviado).toHaveBeenCalled();
      expect(conteoRepo.marcarSincronizado).not.toHaveBeenCalled();
    });

    it('sin los identificadores del TAG no puede marcarlo, pero el envío queda enviado', async () => {
      repo.listarPendientes.and.resolveTo([fila('A', { conteoId: null })]);
      estadoApi.consultar.and.resolveTo([servidor('A')]);

      await useCase.execute();

      expect(repo.marcarEnviado).toHaveBeenCalled();
      expect(conteoRepo.marcarSincronizado).not.toHaveBeenCalled();
    });

    // Si marcar el TAG falla no se pierde nada: el envío ya figura ENVIADO, así
    // que el TAG sigue bloqueado, y se corrige en la próxima reconciliación.
    it('si falla al marcar el TAG, no rompe ni frena al resto', async () => {
      repo.listarPendientes.and.resolveTo([fila('A'), fila('B', { ubicacionId: 229 })]);
      estadoApi.consultar.and.resolveTo([servidor('A'), servidor('B')]);
      conteoRepo.marcarSincronizado.and.callFake(async (_c, ubicacion) => {
        if (ubicacion === 228) throw new Error('disco lleno');
      });
      spyOn(console, 'error');

      const r = await useCase.execute();

      expect(r.confirmados).toBe(2);
      expect(repo.marcarEnviado).toHaveBeenCalledTimes(2);
    });
  });

  describe('el servidor NO los tiene', () => {
    it('uno en duda (PENDIENTE) pasa a no recibido', async () => {
      repo.listarPendientes.and.resolveTo([fila('A', { estado: 'PENDIENTE' })]);
      estadoApi.consultar.and.resolveTo([noExiste('A')]);

      const r = await useCase.execute();

      expect(r.noRecibidos).toBe(1);
      expect(repo.marcarError).toHaveBeenCalledOnceWith('A', 'El servidor no recibió este envío.');
      expect(conteoRepo.marcarSincronizado).not.toHaveBeenCalled();
    });

    // Consultar una y otra vez no debe inflar el contador de intentos.
    it('uno que ya era error no se vuelve a escribir', async () => {
      repo.listarPendientes.and.resolveTo([fila('A', { estado: 'ERROR', error: 'Sin conexión' })]);
      estadoApi.consultar.and.resolveTo([noExiste('A')]);

      const r = await useCase.execute();

      expect(r.noRecibidos).toBe(1);
      expect(repo.marcarError).not.toHaveBeenCalled();
    });
  });

  describe('conflictos de identidad', () => {
    it('un uid que existe pero es de otro TAG no se da por enviado y se cuenta aparte', async () => {
      repo.listarPendientes.and.resolveTo([fila('A')]);
      estadoApi.consultar.and.resolveTo([servidor('A', { tagCodigo: '9999' })]);

      const r = await useCase.execute();

      expect(r.conflictos).toBe(1);
      expect(r.confirmados).toBe(0);
      expect(repo.marcarEnviado).not.toHaveBeenCalled();
      expect(conteoRepo.marcarSincronizado).not.toHaveBeenCalled();
    });
  });

  describe('no se pudo averiguar', () => {
    beforeEach(() => repo.listarPendientes.and.resolveTo([fila('A'), fila('B')]));

    it('un uid que el servidor no menciona sigue en duda, NO se lee como "no existe"', async () => {
      estadoApi.consultar.and.resolveTo([servidor('A')]);

      const r = await useCase.execute();

      expect(r.confirmados).toBe(1);
      expect(r.sinRespuesta).toBe(1);
      expect(r.noRecibidos).toBe(0);
      expect(repo.marcarError).not.toHaveBeenCalled();
    });

    it('sin red: todos siguen en duda y no se marca nada', async () => {
      estadoApi.consultar.and.rejectWith(new NetworkError('Sin conexión con el servidor.'));

      const r = await useCase.execute();

      expect(r).toEqual({ ...vacio, total: 2, sinRespuesta: 2 });
      expect(repo.marcarEnviado).not.toHaveBeenCalled();
      expect(repo.marcarError).not.toHaveBeenCalled();
    });

    it('un error del servidor al consultar no se confunde con "la consulta no existe"', async () => {
      estadoApi.consultar.and.rejectWith(new ApiError('No pudimos consultar.', 500));

      const r = await useCase.execute();

      expect(r.sinRespuesta).toBe(2);
      expect(r.consultaNoDisponible).toBeFalse();
    });

    for (const status of [404, 405]) {
      it(`si el servidor no tiene la consulta (${status}) lo informa y no resuelve nada`, async () => {
        estadoApi.consultar.and.rejectWith(new ApiError('No encontrado', status));

        const r = await useCase.execute();

        expect(r.consultaNoDisponible).toBeTrue();
        expect(r.sinRespuesta).toBe(2);
        expect(repo.marcarEnviado).not.toHaveBeenCalled();
        expect(repo.marcarError).not.toHaveBeenCalled();
      });
    }
  });

  it('una mezcla de resultados se cuenta cada uno en su lugar', async () => {
    repo.listarPendientes.and.resolveTo([
      fila('OK', { ubicacionId: 1 }), fila('DIF', { ubicacionId: 2 }), fila('NO', { ubicacionId: 3 }),
      fila('AJENO', { ubicacionId: 4 }), fila('SIN', { ubicacionId: 5 }),
    ]);
    estadoApi.consultar.and.resolveTo([
      servidor('OK'), servidor('DIF', { totalLecturas: 1 }), noExiste('NO'), servidor('AJENO', { iteracion: 2 }),
    ]);

    expect(await useCase.execute()).toEqual({
      total: 5, confirmados: 2, conDiferencias: 1, noRecibidos: 1, conflictos: 1, sinRespuesta: 1, consultaNoDisponible: false,
    });
  });
});
