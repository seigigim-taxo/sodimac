import { TestBed } from '@angular/core/testing';
import { EnviarPendientesUseCase, ResultadoEnviarPendientes, cambioLoMostrado } from './enviar-pendientes.use-case';
import { IntentarEnvioUseCase, ResultadoIntento } from './intentar-envio.use-case';
import { ReconciliarEnviosUseCase, ResultadoReconciliacion } from './reconciliar-envios.use-case';
import { MENSAJE_CONFLICTO } from './resolver-envio.use-case';
import { EnvioEnCursoService } from './envio-en-curso.service';
import { SanarTagsEnviadosUseCase } from './sanar-tags-enviados.use-case';
import { SINCRONIZACION_REPOSITORY_TOKEN, SincronizacionRepository } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { CONTEO_REPOSITORY_TOKEN, ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { SincronizacionSync } from '../../domain/sincronizacion/models/sincronizacion-sync.model';
import { ApiService } from '../../core/http/api.service';
import { NetworkError } from '../../domain/shared/errors/network.error';

/*
 * "Enviar pendientes": recorre la cola y reintenta lo que falta. Lo que cambia
 * respecto de antes:
 *
 *   - Primero le pregunta al servidor, en UNA consulta, cuáles ya tiene: un TAG
 *     cuya respuesta se perdió se confirma sin volver a subirlo entero.
 *   - Cada TAG se envía con las mismas reglas que al finalizar (una sola pieza).
 *   - Un envío que estaba en duda se sigue tratando como en duda.
 *
 * La validación del analista sigue como siempre.
 */
const fila = (extra: Partial<SincronizacionSync> = {}): SincronizacionSync => ({
  id: 1, eventoId: 10, pdaId: 1, tipo: 'CARGA_DESDE_PDA', operacion: 'TAG_FINALIZADO',
  perfil: 'OPERADOR', iteracion: 1, conteoId: 10, ubicacionId: 228, operadorId: 1,
  cargaUid: 'UID-1', payloadJson: JSON.stringify({ carga_uid: 'UID-1', tag_codigo: '7001' }),
  estado: 'ERROR', error: 'Sin conexión', intentos: 1,
  fechaHora: '2026-10-05 10:19:38', fechaUltimoIntento: null, fechaEnvio: null, registrosProcesados: null,
  ...extra,
});

const reconciliacion = (extra: Partial<ResultadoReconciliacion> = {}): ResultadoReconciliacion => ({
  total: 0, confirmados: 0, conDiferencias: 0, noRecibidos: 0, conflictos: 0, sinRespuesta: 0, consultaNoDisponible: false,
  ...extra,
});

describe('EnviarPendientesUseCase', () => {
  let useCase: EnviarPendientesUseCase;
  let repo: jasmine.SpyObj<SincronizacionRepository>;
  let conteoRepo: jasmine.SpyObj<ConteoRepository>;
  let api: jasmine.SpyObj<ApiService>;
  let reconciliar: jasmine.SpyObj<ReconciliarEnviosUseCase>;
  let intentar: jasmine.SpyObj<IntentarEnvioUseCase>;
  let sanar: jasmine.SpyObj<SanarTagsEnviadosUseCase>;

  const enviado: ResultadoIntento = { tipo: 'ENVIADO', conDiferencias: false };

  beforeEach(() => {
    repo = jasmine.createSpyObj<SincronizacionRepository>('SincronizacionRepository', [
      'listarPendientes', 'marcarEnviado', 'marcarError', 'limpiarEnviosHuerfanos',
    ]);
    repo.limpiarEnviosHuerfanos.and.resolveTo();
    repo.listarPendientes.and.resolveTo([]);
    repo.marcarEnviado.and.resolveTo();
    repo.marcarError.and.resolveTo();

    conteoRepo = jasmine.createSpyObj<ConteoRepository>('ConteoRepository', ['marcarSincronizado']);
    conteoRepo.marcarSincronizado.and.resolveTo();

    api = jasmine.createSpyObj<ApiService>('ApiService', ['post']);
    api.post.and.resolveTo({ total_productos: 3 } as never);

    reconciliar = jasmine.createSpyObj<ReconciliarEnviosUseCase>('ReconciliarEnviosUseCase', ['execute']);
    reconciliar.execute.and.resolveTo(reconciliacion());

    intentar = jasmine.createSpyObj<IntentarEnvioUseCase>('IntentarEnvioUseCase', ['execute']);
    intentar.execute.and.resolveTo(enviado);

    sanar = jasmine.createSpyObj<SanarTagsEnviadosUseCase>('SanarTagsEnviadosUseCase', ['execute']);
    sanar.execute.and.resolveTo(0);

    TestBed.configureTestingModule({
      providers: [
        EnviarPendientesUseCase,
        { provide: SanarTagsEnviadosUseCase, useValue: sanar },
        { provide: SINCRONIZACION_REPOSITORY_TOKEN, useValue: repo },
        { provide: CONTEO_REPOSITORY_TOKEN, useValue: conteoRepo },
        { provide: ApiService, useValue: api },
        { provide: ReconciliarEnviosUseCase, useValue: reconciliar },
        { provide: IntentarEnvioUseCase, useValue: intentar },
      ],
    });
    useCase = TestBed.inject(EnviarPendientesUseCase);
  });

  it('sin pendientes no envía nada', async () => {
    expect(await useCase.execute()).toEqual(jasmine.objectContaining({ enviados: 0, conError: 0, total: 0 }));
    expect(intentar.execute).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  describe('primero le pregunta al servidor', () => {
    it('reconcilia antes de volver a mirar la cola', async () => {
      const orden: string[] = [];
      let llamadas = 0;
      repo.listarPendientes.and.callFake(async () => { llamadas++; orden.push(`listar${llamadas}`); return [fila()]; });
      reconciliar.execute.and.callFake(async () => { orden.push('reconciliar'); return reconciliacion(); });

      await useCase.execute();

      expect(orden).toEqual(['listar1', 'reconciliar', 'listar2', 'listar3']);
    });

    it('lo que el servidor confirmó cuenta como enviado, aunque no se haya vuelto a subir', async () => {
      repo.listarPendientes.and.returnValues(Promise.resolve([fila(), fila({ cargaUid: 'UID-2' })]), Promise.resolve([]), Promise.resolve([]));
      reconciliar.execute.and.resolveTo(reconciliacion({ confirmados: 2 }));

      expect(await useCase.execute()).toEqual(jasmine.objectContaining({ enviados: 2, conError: 0, total: 2 }));
      expect(intentar.execute).not.toHaveBeenCalled();
    });

    it('lo confirmado se suma a lo que se envía después', async () => {
      repo.listarPendientes.and.returnValues(
        Promise.resolve([fila(), fila({ cargaUid: 'UID-2' })]),
        Promise.resolve([fila({ cargaUid: 'UID-2' })]),
        Promise.resolve([]),
      );
      reconciliar.execute.and.resolveTo(reconciliacion({ confirmados: 1 }));

      expect(await useCase.execute()).toEqual(jasmine.objectContaining({ enviados: 2, conError: 0, total: 2 }));
    });

    it('si la reconciliación falla, igual envía lo pendiente (como funcionaba antes)', async () => {
      spyOn(console, 'error');
      repo.listarPendientes.and.resolveTo([fila()]);
      reconciliar.execute.and.rejectWith(new Error('sin consulta'));

      expect(await useCase.execute()).toEqual(jasmine.objectContaining({ enviados: 1, conError: 0, total: 1 }));
      expect(intentar.execute).toHaveBeenCalled();
    });
  });

  describe('un TAG del operador', () => {
    beforeEach(() => repo.listarPendientes.and.resolveTo([fila()]));

    it('lo envía con el payload GUARDADO, ya leído como objeto', async () => {
      await useCase.execute();

      expect(intentar.execute).toHaveBeenCalledOnceWith({
        cargaUid: 'UID-1',
        payload: { carga_uid: 'UID-1', tag_codigo: '7001' },
        payloadJson: JSON.stringify({ carga_uid: 'UID-1', tag_codigo: '7001' }),
        previoEnDuda: false,
      });
    });

    // PENDIENTE = resultado sin resolver: un intento anterior pudo haber llegado.
    it('uno PENDIENTE se trata como "ya en duda"; uno con ERROR, no', async () => {
      repo.listarPendientes.and.resolveTo([fila({ estado: 'PENDIENTE' })]);
      await useCase.execute();
      expect(intentar.execute.calls.mostRecent().args[0].previoEnDuda).toBeTrue();

      repo.listarPendientes.and.resolveTo([fila({ estado: 'ERROR' })]);
      await useCase.execute();
      expect(intentar.execute.calls.mostRecent().args[0].previoEnDuda).toBeFalse();
    });

    it('si llega: cuenta como enviado y marca el TAG como sincronizado', async () => {
      const r = await useCase.execute();

      expect(r).toEqual(jasmine.objectContaining({ enviados: 1, conError: 0, total: 1 }));
      expect(conteoRepo.marcarSincronizado).toHaveBeenCalledOnceWith(10, 228, 1, 1);
    });

    it('si el servidor ya lo tenía con otro contenido, también cuenta como enviado', async () => {
      intentar.execute.and.resolveTo({ tipo: 'ENVIADO', conDiferencias: true });

      expect((await useCase.execute()).enviados).toBe(1);
      expect(conteoRepo.marcarSincronizado).toHaveBeenCalled();
    });

    it('si el servidor no lo tiene: cuenta como error y NO marca el TAG', async () => {
      intentar.execute.and.resolveTo({ tipo: 'NO_RECIBIDO', conflicto: false, error: 'Sin conexión' });

      expect(await useCase.execute()).toEqual(jasmine.objectContaining({ enviados: 0, conError: 1, total: 1 }));
      expect(conteoRepo.marcarSincronizado).not.toHaveBeenCalled();
    });

    it('si quedó en duda: cuenta como error y NO marca el TAG', async () => {
      intentar.execute.and.resolveTo({ tipo: 'EN_DUDA', error: 'corte' });

      expect(await useCase.execute()).toEqual(jasmine.objectContaining({ enviados: 0, conError: 1, total: 1 }));
      expect(conteoRepo.marcarSincronizado).not.toHaveBeenCalled();
    });

    it('un envío del analista queda enviado pero no marca ningún conteo', async () => {
      repo.listarPendientes.and.resolveTo([fila({ perfil: 'ANALISTA_CLIENTE' })]);

      await useCase.execute();

      expect(conteoRepo.marcarSincronizado).not.toHaveBeenCalled();
    });

    it('sin los identificadores del TAG no puede marcar el conteo', async () => {
      repo.listarPendientes.and.resolveTo([fila({ conteoId: null })]);

      expect((await useCase.execute()).enviados).toBe(1);
      expect(conteoRepo.marcarSincronizado).not.toHaveBeenCalled();
    });
  });

  describe('filas que no se pueden enviar', () => {
    it('sin payload guardado: error, y no llama al servidor', async () => {
      repo.listarPendientes.and.resolveTo([fila({ payloadJson: null })]);

      expect(await useCase.execute()).toEqual(jasmine.objectContaining({ enviados: 0, conError: 1, total: 1 }));
      expect(intentar.execute).not.toHaveBeenCalled();
    });

    it('sin carga_uid tampoco', async () => {
      repo.listarPendientes.and.resolveTo([fila({ cargaUid: null })]);

      expect(await useCase.execute()).toEqual(jasmine.objectContaining({ enviados: 0, conError: 1, total: 1 }));
      expect(intentar.execute).not.toHaveBeenCalled();
    });

    it('con un payload dañado: lo anota como error y sigue', async () => {
      repo.listarPendientes.and.resolveTo([fila({ payloadJson: '{roto' })]);

      expect(await useCase.execute()).toEqual(jasmine.objectContaining({ enviados: 0, conError: 1, total: 1 }));
      expect(repo.marcarError).toHaveBeenCalledOnceWith('UID-1', 'El envío guardado está dañado.');
      expect(intentar.execute).not.toHaveBeenCalled();
    });

    // Se sabe que ese identificador es de otro TAG: insistir cada vez no sirve.
    it('uno marcado como conflicto de identificador no se vuelve a intentar', async () => {
      repo.listarPendientes.and.resolveTo([fila({ estado: 'ERROR', error: MENSAJE_CONFLICTO })]);

      expect(await useCase.execute()).toEqual(jasmine.objectContaining({ enviados: 0, conError: 1, total: 1 }));
      expect(intentar.execute).not.toHaveBeenCalled();
    });
  });

  describe('varias filas', () => {
    const tres = () => [fila({ cargaUid: 'A', ubicacionId: 1 }), fila({ cargaUid: 'B', ubicacionId: 2 }), fila({ cargaUid: 'C', ubicacionId: 3 })];
    beforeEach(() => repo.listarPendientes.and.resolveTo(tres()));

    it('un fallo no frena a las demás', async () => {
      intentar.execute.and.callFake(async (e) =>
        e.cargaUid === 'B' ? { tipo: 'EN_DUDA', error: 'cortado' } as ResultadoIntento : enviado);

      expect(await useCase.execute()).toEqual(jasmine.objectContaining({ enviados: 2, conError: 1, total: 3 }));
    });

    it('un error inesperado en una tampoco frena a las demás', async () => {
      spyOn(console, 'error');
      intentar.execute.and.callFake(async (e) => {
        if (e.cargaUid === 'B') throw new Error('disco lleno');
        return enviado;
      });

      expect(await useCase.execute()).toEqual(jasmine.objectContaining({ enviados: 2, conError: 1, total: 3 }));
    });

    it('las manda en el orden que entrega la cola', async () => {
      await useCase.execute();

      expect(intentar.execute.calls.allArgs().map((a) => a[0].cargaUid)).toEqual(['A', 'B', 'C']);
    });
  });

  describe('una validación del analista', () => {
    const validacion = (extra: Partial<SincronizacionSync> = {}) => fila({
      operacion: 'VALIDACION_OPERACIONAL', perfil: 'ANALISTA_CLIENTE', cargaUid: 'VAL-1',
      payloadJson: JSON.stringify({ carga_uid: 'VAL-1' }), ...extra,
    });

    beforeEach(() => repo.listarPendientes.and.resolveTo([validacion()]));

    it('va a su propio endpoint, con sus reglas de siempre', async () => {
      await useCase.execute();

      expect(api.post).toHaveBeenCalledOnceWith('sincronizaciones/validacion-analista.php', { carga_uid: 'VAL-1' });
      expect(repo.marcarEnviado).toHaveBeenCalledOnceWith('VAL-1', 3);
    });

    it('no usa la pieza compartida de los TAGs ni toca el conteo', async () => {
      await useCase.execute();

      expect(intentar.execute).not.toHaveBeenCalled();
      expect(conteoRepo.marcarSincronizado).not.toHaveBeenCalled();
    });

    it('si falla: lo anota con error y cuenta como error', async () => {
      api.post.and.rejectWith(new NetworkError('Sin conexión con el servidor.'));

      expect(await useCase.execute()).toEqual(jasmine.objectContaining({ enviados: 0, conError: 1, total: 1 }));
      expect(repo.marcarError).toHaveBeenCalledOnceWith('VAL-1', 'Sin conexión con el servidor.');
    });
  });

  /*
   * Los reintentos automáticos: cuidar la batería y no encimarse con otros envíos.
   */
  /*
   * El reporte de versión viaja por esta misma cola pero NO es un TAG: se reintenta
   * tal cual, sin reglas de TAG ni de identificador.
   */
  describe('un reporte de versión', () => {
    const version = (extra: Partial<SincronizacionSync> = {}) => fila({
      cargaUid: 'V-1', operacion: 'VERSION_REPORTE', perfil: 'OPERADOR', conteoId: null, ubicacionId: null,
      payloadJson: JSON.stringify({ version: '1.0.14' }), ...extra,
    });

    it('se manda al servicio de versiones, no como un TAG', async () => {
      repo.listarPendientes.and.resolveTo([version()]);
      api.post.and.resolveTo({ data: { id: 55 } } as never);

      const r = await useCase.execute();

      expect(api.post).toHaveBeenCalledOnceWith('sincronizaciones/reporte-version.php', { version: '1.0.14' });
      expect(intentar.execute).not.toHaveBeenCalled();
      expect(repo.marcarEnviado).toHaveBeenCalledOnceWith('V-1', 55);
      expect(r.enviados).toBe(1);
    });

    it('si falla, queda con error y se cuenta, sin frenar a los demás', async () => {
      repo.listarPendientes.and.resolveTo([version(), fila({ cargaUid: 'UID-2' })]);
      api.post.and.rejectWith(new Error('sin servicio'));

      const r = await useCase.execute();

      expect(repo.marcarError).toHaveBeenCalledOnceWith('V-1', 'sin servicio');
      expect(intentar.execute).toHaveBeenCalledTimes(1);
      expect(r.conError).toBe(1);
      expect(r.enviados).toBe(1);
    });

    it('no se avisa como TAG confirmado', async () => {
      repo.listarPendientes.and.returnValues(Promise.resolve([version()]), Promise.resolve([version()]), Promise.resolve([]));
      api.post.and.resolveTo({ data: { id: 1 } } as never);

      expect((await useCase.execute()).confirmadosTags).toEqual([]);
    });
  });

  describe('para los reintentos automáticos', () => {
    const conflicto = (uid: string) => fila({ cargaUid: uid, estado: 'ERROR', error: MENSAJE_CONFLICTO });
    const otroTag = (uid: string, tag: string) =>
      fila({ cargaUid: uid, payloadJson: JSON.stringify({ carga_uid: uid, tag_codigo: tag }) });
    const caeLaRed = { tipo: 'EN_DUDA', error: 'corte', porRed: true } as ResultadoIntento;

    describe('cortar al primer fallo de red', () => {
      beforeEach(() => {
        repo.listarPendientes.and.resolveTo([otroTag('A', '1'), otroTag('B', '2'), otroTag('C', '3')]);
        intentar.execute.and.resolveTo(caeLaRed);
      });

      it('con la opción activada, no prueba con el resto', async () => {
        const r = await useCase.execute({ cortarAlFalloDeRed: true });

        expect(intentar.execute).toHaveBeenCalledTimes(1);
        expect(r.cortadoPorRed).toBeTrue();
      });

      it('lo que no se probó sigue contando como pendiente y reintentable', async () => {
        const r = await useCase.execute({ cortarAlFalloDeRed: true });

        expect(r.conError).toBe(3);
        expect(r.reintentables).toBe(3);
        expect(r.enviados).toBe(0);
      });

      it('sin la opción (el botón del menú), prueba con todos como siempre', async () => {
        const r = await useCase.execute();

        expect(intentar.execute).toHaveBeenCalledTimes(3);
        expect(r.cortadoPorRed).toBeFalse();
      });

      it('un fallo que NO es de red no corta la tanda', async () => {
        intentar.execute.and.resolveTo({ tipo: 'NO_RECIBIDO', conflicto: false, error: 'Falta TAG.' });

        await useCase.execute({ cortarAlFalloDeRed: true });

        expect(intentar.execute).toHaveBeenCalledTimes(3);
      });

      it('lo que ya salió antes del corte cuenta como enviado', async () => {
        intentar.execute.and.callFake(async (e) => (e.cargaUid === 'A' ? enviado : caeLaRed));

        const r = await useCase.execute({ cortarAlFalloDeRed: true });

        expect(r.enviados).toBe(1);
        expect(intentar.execute).toHaveBeenCalledTimes(2);
        expect(r.conError).toBe(2);
      });

      it('un envío rechazado por identificador ajeno no se cuenta como reintentable', async () => {
        repo.listarPendientes.and.resolveTo([otroTag('A', '1')]);
        intentar.execute.and.resolveTo({ tipo: 'NO_RECIBIDO', conflicto: true, error: MENSAJE_CONFLICTO });

        const r = await useCase.execute({ cortarAlFalloDeRed: true });

        expect(r.conError).toBe(1);
        expect(r.reintentables).toBe(0);
      });

      it('lo que nunca saldrá no se cuenta como reintentable', async () => {
        repo.listarPendientes.and.resolveTo([otroTag('A', '1'), conflicto('Z')]);

        const r = await useCase.execute({ cortarAlFalloDeRed: true });

        expect(r.reintentables).toBe(1);
        expect(r.conError).toBe(2);
      });
    });

    describe('cuando todo lo pendiente ya se sabe que no va a salir', () => {
      it('no gasta ni una consulta al servidor', async () => {
        repo.listarPendientes.and.resolveTo([conflicto('Z'), fila({ cargaUid: 'Y', payloadJson: null })]);

        const r = await useCase.execute({ cortarAlFalloDeRed: true });

        expect(reconciliar.execute).not.toHaveBeenCalled();
        expect(intentar.execute).not.toHaveBeenCalled();
        expect(r).toEqual({ enviados: 0, conError: 2, total: 2, confirmadosTags: [], reintentables: 0, cortadoPorRed: false });
      });

      it('con la cola vacía, tampoco', async () => {
        repo.listarPendientes.and.resolveTo([]);

        await useCase.execute({ cortarAlFalloDeRed: true });

        expect(reconciliar.execute).not.toHaveBeenCalled();
      });

      it('si hay al menos uno que sí puede salir, consulta como siempre', async () => {
        repo.listarPendientes.and.resolveTo([conflicto('Z'), otroTag('A', '1')]);

        await useCase.execute();

        expect(reconciliar.execute).toHaveBeenCalled();
      });
    });

    describe('un envío a la vez por TAG', () => {
      it('si otro ya lo está mandando, lo salta sin contarlo como error', async () => {
        repo.listarPendientes.and.resolveTo([otroTag('A', '1'), otroTag('B', '2')]);
        const candado = TestBed.inject(EnvioEnCursoService);
        candado.tomar('A');

        const r = await useCase.execute();

        expect(intentar.execute).toHaveBeenCalledTimes(1);
        expect(intentar.execute.calls.mostRecent().args[0].cargaUid).toBe('B');
        expect(r.conError).toBe(0);
        expect(r.enviados).toBe(1);
      });

      it('suelta el candado al terminar, aunque el envío falle', async () => {
        repo.listarPendientes.and.resolveTo([otroTag('A', '1')]);
        intentar.execute.and.rejectWith(new Error('boom'));
        spyOn(console, 'error');
        const candado = TestBed.inject(EnvioEnCursoService);

        await useCase.execute();

        expect(candado.estaEnCurso('A')).toBeFalse();
      });

      it('mientras envía, el TAG figura en curso', async () => {
        repo.listarPendientes.and.resolveTo([otroTag('A', '1')]);
        const candado = TestBed.inject(EnvioEnCursoService);
        let durante: boolean | null = null;
        intentar.execute.and.callFake(async () => { durante = candado.estaEnCurso('A'); return enviado; });

        await useCase.execute();

        expect(durante as boolean | null).toBeTrue();
      });
    });

    describe('qué TAGs quedaron confirmados (para avisarle al operador)', () => {
      it('los que dejaron de estar pendientes, por su número de TAG', async () => {
        repo.listarPendientes.and.returnValues(
          Promise.resolve([otroTag('A', '7001'), otroTag('B', '7002')]),
          Promise.resolve([otroTag('A', '7001'), otroTag('B', '7002')]),
          Promise.resolve([otroTag('B', '7002')]),
        );

        const r = await useCase.execute();

        expect(r.confirmadosTags).toEqual(['7001']);
      });

      it('cubre también lo que solo se confirmó preguntando al servidor', async () => {
        repo.listarPendientes.and.returnValues(
          Promise.resolve([otroTag('A', '7001')]),
          Promise.resolve([]),
          Promise.resolve([]),
        );
        reconciliar.execute.and.resolveTo(reconciliacion({ confirmados: 1 }));

        expect((await useCase.execute()).confirmadosTags).toEqual(['7001']);
      });

      it('si nada se confirmó, la lista queda vacía', async () => {
        repo.listarPendientes.and.resolveTo([otroTag('A', '7001')]);
        intentar.execute.and.resolveTo({ tipo: 'NO_RECIBIDO', conflicto: false, error: 'x' });

        expect((await useCase.execute()).confirmadosTags).toEqual([]);
      });

      it('no avisa de las validaciones del analista', async () => {
        const validacion = fila({ cargaUid: 'V', operacion: 'VALIDACION_OPERACIONAL', perfil: 'ANALISTA_CLIENTE' });
        repo.listarPendientes.and.returnValues(Promise.resolve([validacion]), Promise.resolve([validacion]), Promise.resolve([]));

        expect((await useCase.execute()).confirmadosTags).toEqual([]);
      });

      it('un TAG repetido en la cola se avisa una sola vez', async () => {
        repo.listarPendientes.and.returnValues(
          Promise.resolve([otroTag('A', '7001'), otroTag('B', '7001')]),
          Promise.resolve([otroTag('A', '7001'), otroTag('B', '7001')]),
          Promise.resolve([]),
        );

        expect((await useCase.execute()).confirmadosTags).toEqual(['7001']);
      });
    });
  });

  /*
   * Antes de mirar la cola se ordena, sin red: lo descartado no se manda, y lo que
   * el servidor ya tiene se marca.
   */
  describe('mantenimiento local antes de enviar', () => {
    it('limpia y sana ANTES de leer lo pendiente', async () => {
      const orden: string[] = [];
      repo.limpiarEnviosHuerfanos.and.callFake(async () => { orden.push('limpiar'); });
      sanar.execute.and.callFake(async () => { orden.push('sanar'); return 0; });
      repo.listarPendientes.and.callFake(async () => { orden.push('listar'); return []; });

      await useCase.execute();

      expect(orden).toEqual(['limpiar', 'sanar', 'listar']);
    });

    it('también en los reintentos automáticos y aunque no haya nada pendiente', async () => {
      repo.listarPendientes.and.resolveTo([]);

      await useCase.execute({ cortarAlFalloDeRed: true });

      expect(repo.limpiarEnviosHuerfanos).toHaveBeenCalledTimes(1);
      expect(sanar.execute).toHaveBeenCalledTimes(1);
      expect(reconciliar.execute).not.toHaveBeenCalled();
    });

    it('si la limpieza falla, igual sana y envía', async () => {
      spyOn(console, 'error');
      repo.limpiarEnviosHuerfanos.and.rejectWith(new Error('disco'));
      repo.listarPendientes.and.resolveTo([fila()]);

      const r = await useCase.execute();

      expect(sanar.execute).toHaveBeenCalled();
      expect(r.enviados).toBe(1);
    });

    it('si sanar falla, igual envía', async () => {
      spyOn(console, 'error');
      sanar.execute.and.rejectWith(new Error('disco'));
      repo.listarPendientes.and.resolveTo([fila()]);

      const r = await useCase.execute();

      expect(r.enviados).toBe(1);
    });
  });

  describe('cambioLoMostrado (¿hay que refrescar las pantallas?)', () => {
    const tanda = (extra: Partial<ResultadoEnviarPendientes> = {}): ResultadoEnviarPendientes => ({
      enviados: 0, conError: 0, total: 0, confirmadosTags: [], reintentables: 0, cortadoPorRed: false, ...extra,
    });

    it('si se confirmó un TAG, sí', () => {
      expect(cambioLoMostrado(tanda({ confirmadosTags: ['7001'] }))).toBeTrue();
    });

    it('si se envió algo, sí (aunque no sea un TAG, como un reporte de versión)', () => {
      expect(cambioLoMostrado(tanda({ enviados: 1 }))).toBeTrue();
    });

    it('si nada cambió (todo falló o no había nada), no', () => {
      expect(cambioLoMostrado(tanda({ total: 3, conError: 3, reintentables: 3 }))).toBeFalse();
      expect(cambioLoMostrado(tanda())).toBeFalse();
    });
  });
});
