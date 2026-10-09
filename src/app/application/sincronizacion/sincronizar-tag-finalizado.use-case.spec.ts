import { TestBed } from '@angular/core/testing';
import { MENSAJE_CAMBIO_TRAS_ENVIO, MENSAJE_SIN_CONFIRMAR, MENSAJE_YA_SE_ENVIA, SincronizarTagFinalizadoUseCase } from './sincronizar-tag-finalizado.use-case';
import { EnvioEnCursoService } from './envio-en-curso.service';
import { IntentarEnvioUseCase, ResultadoIntento } from './intentar-envio.use-case';
import { MENSAJE_CONFLICTO, ResolverEnvioUseCase, ResultadoResolucion } from './resolver-envio.use-case';
import { SINCRONIZACION_REPOSITORY_TOKEN, SincronizacionRepository } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { ESTADO_CARGAS_API_REPOSITORY_TOKEN, EstadoCargasApiRepository } from '../../domain/sincronizacion/repositories/estado-cargas-api.repository';
import { EnvioTag } from '../../domain/sincronizacion/models/estado-envio-tag.model';
import { GuardarSyncTagInput, SincronizacionSync } from '../../domain/sincronizacion/models/sincronizacion-sync.model';
import { TagFinalizadoPayload } from '../../domain/sincronizacion/models/tag-finalizado.model';
import { ApiService } from '../../core/http/api.service';
import { NetworkError } from '../../domain/shared/errors/network.error';
import { environment } from '../../../environments/environment';

/*
 * El envío de UN TAG al finalizarlo. Lo que cambia respecto de antes:
 *
 *   - Antes de mandar, mira si el TAG ya tuvo un envío. Si el servidor lo tiene
 *     —o pudo tenerlo— no lo manda de nuevo: averigua.
 *   - Si falla, distingue "no llegó" de "no sabemos si llegó".
 *   - Si el TAG cambió después de un envío que el servidor pudo haber recibido,
 *     no lo da por enviado: lo nuevo no viajaría.
 *
 * El analista NO pasa por nada de eso: su envío sigue como siempre.
 */
const PAYLOAD_ACTUAL = {
  carga_uid: 'UID-1', codigo_tienda: '4093', tag_codigo: '7001', iteracion: 1, numero_agenda: 'AG-1',
  detalles: [{ sku: 'A', lecturas: [{ lectura_uid: 'L1', cantidad: 30 }] }],
} as unknown as TagFinalizadoPayload;

const entrada = (extra: Partial<GuardarSyncTagInput> = {}): GuardarSyncTagInput => ({
  eventoId: 10, pdaId: 1, iteracion: 1, perfil: 'OPERADOR',
  conteoId: 10, ubicacionId: 228, operadorId: 1,
  cargaUid: 'UID-1', payload: PAYLOAD_ACTUAL,
  ...extra,
});

const envioGuardado = (extra: Partial<SincronizacionSync> = {}): SincronizacionSync => ({
  id: 1, eventoId: 10, pdaId: 1, tipo: 'CARGA_DESDE_PDA', operacion: 'TAG_FINALIZADO', perfil: 'OPERADOR',
  iteracion: 1, conteoId: 10, ubicacionId: 228, operadorId: 1, cargaUid: 'UID-1',
  payloadJson: JSON.stringify(PAYLOAD_ACTUAL), estado: 'PENDIENTE', error: 'corte', intentos: 1,
  fechaHora: '2026-10-05 10:19:38', fechaUltimoIntento: null, fechaEnvio: null, registrosProcesados: null,
  ...extra,
});

describe('SincronizarTagFinalizadoUseCase', () => {
  let useCase: SincronizarTagFinalizadoUseCase;
  let repo: jasmine.SpyObj<SincronizacionRepository>;
  let intentar: jasmine.SpyObj<IntentarEnvioUseCase>;
  let resolver: jasmine.SpyObj<ResolverEnvioUseCase>;
  let api: jasmine.SpyObj<ApiService>;
  let orden: string[];

  const estadoPrevio = (e: Partial<EnvioTag>) =>
    repo.estadoEnvioTag.and.resolveTo({ estado: 'SIN_ENVIO', cargaUid: null, detalle: null, ...e });

  beforeEach(() => {
    orden = [];
    repo = jasmine.createSpyObj<SincronizacionRepository>('SincronizacionRepository', [
      'estadoEnvioTag', 'obtenerEnvio', 'guardarSyncTag', 'marcarEnviado', 'marcarError',
    ]);
    repo.estadoEnvioTag.and.resolveTo({ estado: 'SIN_ENVIO', cargaUid: null, detalle: null });
    repo.obtenerEnvio.and.resolveTo(null);
    repo.guardarSyncTag.and.callFake(async () => { orden.push('guardar'); });
    repo.marcarEnviado.and.resolveTo();
    repo.marcarError.and.resolveTo();

    intentar = jasmine.createSpyObj<IntentarEnvioUseCase>('IntentarEnvioUseCase', ['execute']);
    intentar.execute.and.callFake(async () => { orden.push('intentar'); return { tipo: 'ENVIADO', conDiferencias: false } as ResultadoIntento; });

    resolver = jasmine.createSpyObj<ResolverEnvioUseCase>('ResolverEnvioUseCase', ['execute']);
    resolver.execute.and.resolveTo({ tipo: 'ENVIADO', conDiferencias: false } as ResultadoResolucion);

    api = jasmine.createSpyObj<ApiService>('ApiService', ['post']);
    api.post.and.resolveTo({ total_productos: 3 } as never);

    TestBed.configureTestingModule({
      providers: [
        SincronizarTagFinalizadoUseCase,
        { provide: SINCRONIZACION_REPOSITORY_TOKEN, useValue: repo },
        { provide: IntentarEnvioUseCase, useValue: intentar },
        { provide: ResolverEnvioUseCase, useValue: resolver },
        { provide: ApiService, useValue: api },
      ],
    });
    useCase = TestBed.inject(SincronizarTagFinalizadoUseCase);
  });

  describe('un TAG sin envío previo', () => {
    it('lo guarda en la cola ANTES de intentar el envío', async () => {
      await useCase.execute(entrada());

      expect(orden).toEqual(['guardar', 'intentar']);
    });

    it('intenta con su payload, sin marcarlo como "ya en duda"', async () => {
      await useCase.execute(entrada());

      expect(intentar.execute).toHaveBeenCalledOnceWith({
        cargaUid: 'UID-1', payload: PAYLOAD_ACTUAL, payloadJson: JSON.stringify(PAYLOAD_ACTUAL), previoEnDuda: false,
      });
    });

    it('si llega: ok y enviado', async () => {
      expect(await useCase.execute(entrada())).toEqual({ ok: true, enviado: true, conDiferencias: false });
    });

    it('si el servidor ya lo tenía con otro contenido: ok, y lo informa', async () => {
      intentar.execute.and.resolveTo({ tipo: 'ENVIADO', conDiferencias: true });

      expect(await useCase.execute(entrada())).toEqual({ ok: true, enviado: true, conDiferencias: true });
    });

    it('si el servidor no lo tiene: no ok, con el motivo', async () => {
      intentar.execute.and.resolveTo({ tipo: 'NO_RECIBIDO', conflicto: false, error: 'Sin conexión con el servidor.' });

      expect(await useCase.execute(entrada())).toEqual({
        ok: false, enviado: false, error: 'Sin conexión con el servidor.', conflicto: false,
      });
    });

    it('si el identificador es de otro TAG: lo marca como conflicto', async () => {
      intentar.execute.and.resolveTo({ tipo: 'NO_RECIBIDO', conflicto: true, error: MENSAJE_CONFLICTO });

      expect((await useCase.execute(entrada())).conflicto).toBeTrue();
    });

    it('si no se pudo saber: no ok y EN DUDA', async () => {
      intentar.execute.and.resolveTo({ tipo: 'EN_DUDA', error: 'El servidor no respondió a tiempo.' });

      expect(await useCase.execute(entrada())).toEqual({
        ok: false, enviado: false, error: 'El servidor no respondió a tiempo.', enDuda: true,
      });
    });

    it('un TAG cuyo envío anterior se sabe que NO llegó se manda como uno nuevo', async () => {
      estadoPrevio({ estado: 'NO_RECIBIDO', cargaUid: 'UID-1', detalle: 'Sin conexión' });

      await useCase.execute(entrada());

      expect(orden).toEqual(['guardar', 'intentar']);
      expect(repo.obtenerEnvio).not.toHaveBeenCalled();
    });
  });

  describe('un TAG que el servidor ya tiene confirmado', () => {
    beforeEach(() => estadoPrevio({ estado: 'ENVIADO', cargaUid: 'UID-1' }));

    it('no lo vuelve a mandar ni a guardar: solo informa que ya estaba', async () => {
      repo.obtenerEnvio.and.resolveTo(envioGuardado({ estado: 'ENVIADO' }));

      const r = await useCase.execute(entrada());

      expect(r).toEqual({ ok: true, enviado: true, yaEstabaEnviado: true });
      expect(orden).toEqual([]);
      expect(intentar.execute).not.toHaveBeenCalled();
      expect(resolver.execute).not.toHaveBeenCalled();
    });

    it('si no se conserva el payload guardado, no hay con qué comparar y no se bloquea', async () => {
      repo.obtenerEnvio.and.resolveTo(null);

      expect((await useCase.execute(entrada())).yaEstabaEnviado).toBeTrue();
    });
  });

  /*
   * LA RED DE SEGURIDAD: si el TAG cambió después de un envío que el servidor
   * tiene o pudo haber recibido, lo nuevo no viajaría. Darlo por enviado dejaría
   * datos solo en la PDA, sin avisar.
   */
  describe('un TAG que cambió después de un envío', () => {
    const CAMBIADO = {
      ...PAYLOAD_ACTUAL,
      detalles: [{ sku: 'A', lecturas: [{ lectura_uid: 'L1', cantidad: 30 }, { lectura_uid: 'L2', cantidad: 54 }] }],
    } as unknown as TagFinalizadoPayload;

    for (const estado of ['ENVIADO', 'EN_DUDA'] as const) {
      it(`con el envío ${estado}: no se da por enviado y se avisa`, async () => {
        estadoPrevio({ estado, cargaUid: 'UID-1' });
        repo.obtenerEnvio.and.resolveTo(envioGuardado());

        const r = await useCase.execute(entrada({ payload: CAMBIADO }));

        expect(r).toEqual({ ok: false, enviado: false, error: MENSAJE_CAMBIO_TRAS_ENVIO, cambioTrasEnvio: true });
      });

      it(`con el envío ${estado}: no guarda, no manda y no consulta nada`, async () => {
        estadoPrevio({ estado, cargaUid: 'UID-1' });
        repo.obtenerEnvio.and.resolveTo(envioGuardado());

        await useCase.execute(entrada({ payload: CAMBIADO }));

        expect(orden).toEqual([]);
        expect(intentar.execute).not.toHaveBeenCalled();
        expect(resolver.execute).not.toHaveBeenCalled();
        expect(repo.marcarEnviado).not.toHaveBeenCalled();
      });
    }

    it('una cantidad distinta en la misma lectura también cuenta como cambio', async () => {
      estadoPrevio({ estado: 'ENVIADO', cargaUid: 'UID-1' });
      repo.obtenerEnvio.and.resolveTo(envioGuardado());
      const otraCantidad = { ...PAYLOAD_ACTUAL, detalles: [{ sku: 'A', lecturas: [{ lectura_uid: 'L1', cantidad: 5 }] }] } as unknown as TagFinalizadoPayload;

      expect((await useCase.execute(entrada({ payload: otraCantidad }))).cambioTrasEnvio).toBeTrue();
    });

    it('cambiar solo la versión de la app NO es un cambio del TAG', async () => {
      estadoPrevio({ estado: 'ENVIADO', cargaUid: 'UID-1' });
      repo.obtenerEnvio.and.resolveTo(envioGuardado());
      const otraVersion = { ...PAYLOAD_ACTUAL, version_app: '1.0.15' } as unknown as TagFinalizadoPayload;

      expect((await useCase.execute(entrada({ payload: otraVersion }))).yaEstabaEnviado).toBeTrue();
    });
  });

  /*
   * Un envío a la vez por TAG: el reintento automático y el "Finalizar" del
   * operador no deben mandar el mismo TAG al mismo tiempo.
   */
  describe('si otro envío ya está mandando este TAG', () => {
    it('no lo duplica: no guarda ni envía, y lo dice', async () => {
      TestBed.inject(EnvioEnCursoService).tomar('UID-1');

      const r = await useCase.execute(entrada());

      expect(r).toEqual({ ok: false, enviado: false, error: MENSAJE_YA_SE_ENVIA, yaSeEnvia: true });
      expect(repo.guardarSyncTag).not.toHaveBeenCalled();
      expect(intentar.execute).not.toHaveBeenCalled();
    });

    it('un TAG distinto no se ve afectado', async () => {
      TestBed.inject(EnvioEnCursoService).tomar('OTRO');

      const r = await useCase.execute(entrada());

      expect(r.ok).toBeTrue();
    });

    it('mientras envía, el TAG figura en curso; al terminar, queda libre', async () => {
      const candado = TestBed.inject(EnvioEnCursoService);
      let durante: boolean | null = null;
      intentar.execute.and.callFake(async () => { durante = candado.estaEnCurso('UID-1'); return { tipo: 'ENVIADO', conDiferencias: false } as ResultadoIntento; });

      await useCase.execute(entrada());

      expect(durante as boolean | null).toBeTrue();
      expect(candado.estaEnCurso('UID-1')).toBeFalse();
    });

    it('queda libre aunque el envío lance un error', async () => {
      intentar.execute.and.rejectWith(new Error('disco'));

      await expectAsync(useCase.execute(entrada())).toBeRejectedWithError('disco');

      expect(TestBed.inject(EnvioEnCursoService).estaEnCurso('UID-1')).toBeFalse();
    });
  });

  describe('un TAG con un envío EN DUDA', () => {
    beforeEach(() => {
      estadoPrevio({ estado: 'EN_DUDA', cargaUid: 'UID-1' });
      repo.obtenerEnvio.and.resolveTo(envioGuardado());
    });

    it('le pregunta al servidor con el payload que quedó GUARDADO, no con uno rearmado', async () => {
      await useCase.execute(entrada());

      expect(resolver.execute).toHaveBeenCalledOnceWith({
        cargaUid: 'UID-1', payloadJson: JSON.stringify(PAYLOAD_ACTUAL),
      });
    });

    it('usa el texto GUARDADO tal cual, aunque el rearmado se escriba distinto con las mismas lecturas', async () => {
      const guardadoConOtroFormato = JSON.stringify(PAYLOAD_ACTUAL, null, 2);
      repo.obtenerEnvio.and.resolveTo(envioGuardado({ payloadJson: guardadoConOtroFormato }));

      await useCase.execute(entrada());

      expect(resolver.execute).toHaveBeenCalledOnceWith({ cargaUid: 'UID-1', payloadJson: guardadoConOtroFormato });
    });

    it('si el servidor lo tiene: ok, sin mandarlo de nuevo', async () => {
      const r = await useCase.execute(entrada());

      expect(r).toEqual({ ok: true, enviado: true, conDiferencias: false });
      expect(intentar.execute).not.toHaveBeenCalled();
      expect(repo.guardarSyncTag).not.toHaveBeenCalled();
    });

    it('si el servidor lo tiene con otro contenido: ok, y lo informa', async () => {
      resolver.execute.and.resolveTo({ tipo: 'ENVIADO', conDiferencias: true });

      expect((await useCase.execute(entrada())).conDiferencias).toBeTrue();
    });

    it('si no se pudo averiguar: sigue EN DUDA, con el último motivo, y no se manda a ciegas', async () => {
      resolver.execute.and.resolveTo({ tipo: 'SIN_RESPUESTA' });

      const r = await useCase.execute(entrada());

      expect(r).toEqual({ ok: false, enviado: false, error: 'corte', enDuda: true });
      expect(intentar.execute).not.toHaveBeenCalled();
    });

    it('si no hay un último motivo, usa uno genérico', async () => {
      repo.obtenerEnvio.and.resolveTo(envioGuardado({ error: null }));
      resolver.execute.and.resolveTo({ tipo: 'SIN_RESPUESTA' });

      expect((await useCase.execute(entrada())).error).toBe(MENSAJE_SIN_CONFIRMAR);
    });

    it('si el identificador es de otro TAG: conflicto, no se da por enviado', async () => {
      resolver.execute.and.resolveTo({ tipo: 'NO_RECIBIDO', conflicto: true });

      const r = await useCase.execute(entrada());

      expect(r).toEqual({ ok: false, enviado: false, error: MENSAJE_CONFLICTO, conflicto: true });
      expect(intentar.execute).not.toHaveBeenCalled();
    });

    it('si el servidor confirma que NO lo tiene: se manda como un envío común', async () => {
      resolver.execute.and.resolveTo({ tipo: 'NO_RECIBIDO', conflicto: false });

      const r = await useCase.execute(entrada());

      expect(orden).toEqual(['guardar', 'intentar']);
      expect(r.ok).toBeTrue();
    });
  });

  /*
   * El analista NO pasa por las reglas de TAG. Estas son las pruebas de siempre:
   * guarda, manda, y anota. Si alguna cambia, cambió el analista.
   */
  describe('el envío del analista (sin reglas de TAG)', () => {
    const analista = (extra: Partial<GuardarSyncTagInput> = {}) =>
      entrada({ perfil: 'ANALISTA_CLIENTE', conteoId: null, ubicacionId: null, ...extra });

    beforeEach(() => {
      repo.marcarEnviado.and.callFake(async () => { orden.push('enviado'); });
      repo.marcarError.and.callFake(async () => { orden.push('error'); });
      api.post.and.callFake((async () => { orden.push('post'); return { total_productos: 3 }; }) as never);
    });

    it('lo guarda, lo manda y lo anota enviado, en ese orden', async () => {
      await useCase.execute(analista());

      expect(orden).toEqual(['guardar', 'post', 'enviado']);
    });

    it('manda el payload al endpoint de TAG', async () => {
      await useCase.execute(analista());

      expect(api.post).toHaveBeenCalledOnceWith(environment.tagFinalizadoEndpoint, PAYLOAD_ACTUAL);
      expect(repo.marcarEnviado).toHaveBeenCalledOnceWith('UID-1', 3);
    });

    it('devuelve ok y enviado, sin los campos nuevos', async () => {
      expect(await useCase.execute(analista())).toEqual({ ok: true, enviado: true });
    });

    it('no mira el estado del TAG ni usa la pieza compartida', async () => {
      await useCase.execute(analista());

      expect(repo.estadoEnvioTag).not.toHaveBeenCalled();
      expect(intentar.execute).not.toHaveBeenCalled();
      expect(resolver.execute).not.toHaveBeenCalled();
    });

    it('si falla: lo anota con error y devuelve ok=false con el mensaje, sin lanzar', async () => {
      api.post.and.callFake((async () => { orden.push('post'); throw new NetworkError('Sin conexión con el servidor.'); }) as never);

      const r = await useCase.execute(analista());

      expect(r).toEqual({ ok: false, enviado: false, error: 'Sin conexión con el servidor.' });
      expect(orden).toEqual(['guardar', 'post', 'error']);
      expect(repo.marcarError).toHaveBeenCalledOnceWith('UID-1', 'Sin conexión con el servidor.');
    });

    it('un error que no es Error usa un mensaje genérico', async () => {
      api.post.and.rejectWith('algo raro');

      expect((await useCase.execute(analista())).error).toBe('Error al enviar conteo al servidor');
    });

    it('un TAG del operador SIN identificadores tampoco pasa por las reglas de TAG', async () => {
      await useCase.execute(entrada({ conteoId: null, ubicacionId: null }));

      expect(repo.estadoEnvioTag).not.toHaveBeenCalled();
      expect(api.post).toHaveBeenCalled();
    });
  });
});

/*
 * El caso que originó todo, con las piezas REALES (solo el servidor está doblado):
 * el TAG 7001 llegó al servidor, la respuesta se perdió, y la PDA no se enteraba.
 */
describe('SincronizarTagFinalizadoUseCase — el caso del TAG 7001, de punta a punta', () => {
  let useCase: SincronizarTagFinalizadoUseCase;
  let repo: jasmine.SpyObj<SincronizacionRepository>;
  let estadoApi: jasmine.SpyObj<EstadoCargasApiRepository>;
  let api: jasmine.SpyObj<ApiService>;

  const SERVIDOR_LO_TIENE = {
    cargaUid: 'UID-1', existe: true, estado: 'PROCESADO' as const, totalLecturas: 1, totalUnidades: 30,
    codigoTienda: '4093', tagCodigo: '7001', iteracion: 1, numeroAgenda: 'AG-1',
  };

  beforeEach(() => {
    repo = jasmine.createSpyObj<SincronizacionRepository>('SincronizacionRepository', [
      'estadoEnvioTag', 'obtenerEnvio', 'guardarSyncTag', 'marcarEnviado', 'marcarEnviadoConDiferencias',
      'marcarError', 'marcarSinRespuesta',
    ]);
    repo.estadoEnvioTag.and.resolveTo({ estado: 'SIN_ENVIO', cargaUid: null, detalle: null });
    for (const m of ['guardarSyncTag', 'marcarEnviado', 'marcarEnviadoConDiferencias', 'marcarError', 'marcarSinRespuesta'] as const) {
      repo[m].and.resolveTo();
    }

    estadoApi = jasmine.createSpyObj<EstadoCargasApiRepository>('EstadoCargasApiRepository', ['consultar']);
    api = jasmine.createSpyObj<ApiService>('ApiService', ['post']);

    TestBed.configureTestingModule({
      providers: [
        SincronizarTagFinalizadoUseCase, IntentarEnvioUseCase, ResolverEnvioUseCase,
        { provide: SINCRONIZACION_REPOSITORY_TOKEN, useValue: repo },
        { provide: ESTADO_CARGAS_API_REPOSITORY_TOKEN, useValue: estadoApi },
        { provide: ApiService, useValue: api },
      ],
    });
    useCase = TestBed.inject(SincronizarTagFinalizadoUseCase);
  });

  it('el servidor lo guardó y la respuesta se perdió: la PDA lo averigua y el operador NO ve ningún fallo', async () => {
    api.post.and.rejectWith(new NetworkError('El servidor no respondió a tiempo.', true, true));
    estadoApi.consultar.and.resolveTo([SERVIDOR_LO_TIENE]);

    const r = await useCase.execute(entrada());

    expect(r.ok).toBeTrue();
    expect(r.enviado).toBeTrue();
    expect(r.enDuda).toBeUndefined();
    expect(repo.marcarEnviado).toHaveBeenCalledOnceWith('UID-1', 1);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('la respuesta se perdió y tampoco se puede preguntar: queda EN DUDA, sin reenviar y sin darlo por perdido', async () => {
    api.post.and.rejectWith(new NetworkError('El servidor no respondió a tiempo.', true, true));
    estadoApi.consultar.and.rejectWith(new NetworkError('Sin conexión con el servidor.', true, false));

    const r = await useCase.execute(entrada());

    expect(r.ok).toBeFalse();
    expect(r.enDuda).toBeTrue();
    expect(repo.marcarError).not.toHaveBeenCalled();
    expect(repo.marcarSinRespuesta).toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('después, con red, el mismo TAG se resuelve solo sin volver a subirlo', async () => {
    // El envío quedó en duda en el intento anterior; ahora la PDA vuelve a intentar.
    repo.estadoEnvioTag.and.resolveTo({ estado: 'EN_DUDA', cargaUid: 'UID-1', detalle: 'corte' });
    repo.obtenerEnvio.and.resolveTo(envioGuardado());
    estadoApi.consultar.and.resolveTo([SERVIDOR_LO_TIENE]);

    const r = await useCase.execute(entrada());

    expect(r.ok).toBeTrue();
    expect(api.post).not.toHaveBeenCalled();
    expect(repo.guardarSyncTag).not.toHaveBeenCalled();
  });
});
