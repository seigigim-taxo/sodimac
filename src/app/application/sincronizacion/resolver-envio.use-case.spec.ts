import { TestBed } from '@angular/core/testing';
import { MENSAJE_CONFLICTO, MENSAJE_NO_RECIBIDO, ResolverEnvioUseCase } from './resolver-envio.use-case';
import { SINCRONIZACION_REPOSITORY_TOKEN, SincronizacionRepository } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { ESTADO_CARGAS_API_REPOSITORY_TOKEN, EstadoCargaServidor, EstadoCargasApiRepository } from '../../domain/sincronizacion/repositories/estado-cargas-api.repository';
import { ApiService } from '../../core/http/api.service';
import { ApiError } from '../../domain/shared/errors/api.error';
import { NetworkError } from '../../domain/shared/errors/network.error';
import { environment } from '../../../environments/environment';

/*
 * Resolver un envío que quedó en duda: preguntarle al servidor si lo tiene y
 * dejar anotado lo que se concluyó.
 *
 * La regla que no se negocia: un envío se da por recibido solo si el servidor lo
 * afirma explícitamente Y es el mismo envío. Casi todas las pruebas de abajo
 * defienden esa regla desde un ángulo distinto.
 */
const UID = 'UID-1';

/* Un payload guardado: 1 producto con 3 lecturas, del TAG 7001 de la tienda 4093. */
const PAYLOAD = JSON.stringify({
  carga_uid: UID, codigo_tienda: '4093', tag_codigo: '7001', iteracion: 1, numero_agenda: 'AG-1',
  detalles: [{ sku: 'A', lecturas: [{ lectura_uid: 'L1' }, { lectura_uid: 'L2' }, { lectura_uid: 'L3' }] }],
});

const ENVIO = { cargaUid: UID, payloadJson: PAYLOAD };

const estado = (extra: Partial<EstadoCargaServidor> = {}): EstadoCargaServidor => ({
  cargaUid: UID, existe: true, estado: 'RECIBIDO', totalLecturas: 3, totalUnidades: 3,
  codigoTienda: '4093', tagCodigo: '7001', iteracion: 1, numeroAgenda: 'AG-1',
  ...extra,
});

describe('ResolverEnvioUseCase', () => {
  let useCase: ResolverEnvioUseCase;
  let repo: jasmine.SpyObj<SincronizacionRepository>;
  let estadoApi: jasmine.SpyObj<EstadoCargasApiRepository>;
  let api: jasmine.SpyObj<ApiService>;

  const nadaMarcado = () => {
    expect(repo.marcarEnviado).not.toHaveBeenCalled();
    expect(repo.marcarEnviadoConDiferencias).not.toHaveBeenCalled();
    expect(repo.marcarError).not.toHaveBeenCalled();
    expect(repo.marcarSinRespuesta).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    repo = jasmine.createSpyObj<SincronizacionRepository>('SincronizacionRepository', [
      'marcarEnviado', 'marcarEnviadoConDiferencias', 'marcarError', 'marcarSinRespuesta',
    ]);
    repo.marcarEnviado.and.resolveTo();
    repo.marcarEnviadoConDiferencias.and.resolveTo();
    repo.marcarError.and.resolveTo();
    repo.marcarSinRespuesta.and.resolveTo();

    estadoApi = jasmine.createSpyObj<EstadoCargasApiRepository>('EstadoCargasApiRepository', ['consultar']);
    estadoApi.consultar.and.resolveTo([estado()]);

    api = jasmine.createSpyObj<ApiService>('ApiService', ['post']);
    api.post.and.resolveTo({ total_productos: 1 } as never);

    TestBed.configureTestingModule({
      providers: [
        ResolverEnvioUseCase,
        { provide: SINCRONIZACION_REPOSITORY_TOKEN, useValue: repo },
        { provide: ESTADO_CARGAS_API_REPOSITORY_TOKEN, useValue: estadoApi },
        { provide: ApiService, useValue: api },
      ],
    });
    useCase = TestBed.inject(ResolverEnvioUseCase);
  });

  describe('el servidor lo tiene', () => {
    it('con las mismas lecturas: enviado, sin diferencias', async () => {
      const r = await useCase.execute(ENVIO);

      expect(r).toEqual({ tipo: 'ENVIADO', conDiferencias: false });
      expect(repo.marcarEnviado).toHaveBeenCalledOnceWith(UID, 1);
      expect(repo.marcarEnviadoConDiferencias).not.toHaveBeenCalled();
    });

    it('pregunta solo por ese uid', async () => {
      await useCase.execute(ENVIO);

      expect(estadoApi.consultar).toHaveBeenCalledOnceWith([UID]);
    });

    it('lo tiene procesado: igual cuenta como enviado', async () => {
      estadoApi.consultar.and.resolveTo([estado({ estado: 'PROCESADO' })]);

      expect((await useCase.execute(ENVIO)).tipo).toBe('ENVIADO');
    });

    it('con otra cantidad de lecturas: enviado, y anota en qué difiere', async () => {
      estadoApi.consultar.and.resolveTo([estado({ totalLecturas: 1 })]);

      const r = await useCase.execute(ENVIO);

      expect(r).toEqual({ tipo: 'ENVIADO', conDiferencias: true });
      expect(repo.marcarEnviadoConDiferencias).toHaveBeenCalledOnceWith(
        UID, 1, 'El servidor ya tenía este envío con 1 lectura(s) y la PDA tiene 3.',
      );
      expect(repo.marcarEnviado).not.toHaveBeenCalled();
    });

    it('el servidor con MÁS lecturas que la PDA también es una diferencia', async () => {
      estadoApi.consultar.and.resolveTo([estado({ totalLecturas: 9 })]);

      expect(await useCase.execute(ENVIO)).toEqual({ tipo: 'ENVIADO', conDiferencias: true });
    });

    it('si el servidor no informó cuántas lecturas tiene, no hay con qué comparar', async () => {
      estadoApi.consultar.and.resolveTo([estado({ totalLecturas: null })]);

      expect(await useCase.execute(ENVIO)).toEqual({ tipo: 'ENVIADO', conDiferencias: false });
    });

    it('un payload viejo sin lecturas no se compara', async () => {
      const sinLecturas = JSON.stringify({ codigo_tienda: '4093', tag_codigo: '7001', detalles: [{ sku: 'A' }] });
      estadoApi.consultar.and.resolveTo([estado({ totalLecturas: 5 })]);

      expect(await useCase.execute({ cargaUid: UID, payloadJson: sinLecturas }))
        .toEqual({ tipo: 'ENVIADO', conDiferencias: false });
    });
  });

  /*
   * LA PROTECCIÓN CENTRAL: que el uid exista no prueba que NUESTRO TAG llegó.
   */
  describe('el uid existe pero es de otro envío', () => {
    for (const [campo, cambio] of [
      ['la tienda', { codigoTienda: '4012' }],
      ['el TAG', { tagCodigo: '7002' }],
      ['la iteración', { iteracion: 2 }],
      ['la agenda', { numeroAgenda: 'AG-9' }],
    ] as [string, Partial<EstadoCargaServidor>][]) {
      it(`si cambia ${campo}: NO se da por enviado, es un conflicto`, async () => {
        estadoApi.consultar.and.resolveTo([estado(cambio)]);

        const r = await useCase.execute(ENVIO);

        expect(r).toEqual({ tipo: 'NO_RECIBIDO', conflicto: true });
        expect(repo.marcarError).toHaveBeenCalledOnceWith(UID, MENSAJE_CONFLICTO);
        expect(repo.marcarEnviado).not.toHaveBeenCalled();
        expect(repo.marcarEnviadoConDiferencias).not.toHaveBeenCalled();
      });
    }

    it('un dato que el servidor no informó no cuenta como diferencia', async () => {
      estadoApi.consultar.and.resolveTo([estado({ tagCodigo: null, numeroAgenda: null })]);

      expect((await useCase.execute(ENVIO)).tipo).toBe('ENVIADO');
    });

    it('si el servidor no informó ninguna identidad, se acepta (no hay con qué comparar)', async () => {
      estadoApi.consultar.and.resolveTo([estado({ codigoTienda: null, tagCodigo: null, iteracion: null, numeroAgenda: null })]);

      expect((await useCase.execute(ENVIO)).tipo).toBe('ENVIADO');
    });

    it('sin payload local no se puede verificar: se acepta lo que dice el servidor', async () => {
      expect((await useCase.execute({ cargaUid: UID, payloadJson: null })).tipo).toBe('ENVIADO');
      expect(repo.marcarEnviado).toHaveBeenCalledOnceWith(UID, 0);
    });
  });

  describe('el servidor NO lo tiene', () => {
    beforeEach(() => estadoApi.consultar.and.resolveTo([estado({ existe: false, estado: null, totalLecturas: null, codigoTienda: null, tagCodigo: null, iteracion: null, numeroAgenda: null })]));

    it('queda como no recibido, editable y reenviable', async () => {
      const r = await useCase.execute(ENVIO);

      expect(r).toEqual({ tipo: 'NO_RECIBIDO', conflicto: false });
      expect(repo.marcarError).toHaveBeenCalledOnceWith(UID, MENSAJE_NO_RECIBIDO);
      expect(repo.marcarEnviado).not.toHaveBeenCalled();
    });
  });

  describe('no se pudo averiguar', () => {
    it('sin red: sigue en duda y no marca nada', async () => {
      estadoApi.consultar.and.rejectWith(new NetworkError('Sin conexión con el servidor.'));

      expect(await useCase.execute(ENVIO)).toEqual({ tipo: 'SIN_RESPUESTA' });
      nadaMarcado();
    });

    it('timeout: sigue en duda', async () => {
      estadoApi.consultar.and.rejectWith(new NetworkError('El servidor no respondió a tiempo.'));

      expect(await useCase.execute(ENVIO)).toEqual({ tipo: 'SIN_RESPUESTA' });
      nadaMarcado();
    });

    it('un error del servidor (500) al consultar: sigue en duda, no se asume que no existe', async () => {
      estadoApi.consultar.and.rejectWith(new ApiError('No pudimos consultar.', 500));

      expect(await useCase.execute(ENVIO)).toEqual({ tipo: 'SIN_RESPUESTA' });
      nadaMarcado();
      expect(api.post).not.toHaveBeenCalled();
    });

    // "Lo que el servidor no menciona" jamás se lee como "no existe": de eso
    // depende que un TAG vuelva a ser editable.
    it('si la respuesta no menciona el uid: sigue en duda', async () => {
      estadoApi.consultar.and.resolveTo([]);

      expect(await useCase.execute(ENVIO)).toEqual({ tipo: 'SIN_RESPUESTA' });
      nadaMarcado();
    });

    it('si la respuesta menciona solo otros uids: sigue en duda', async () => {
      estadoApi.consultar.and.resolveTo([estado({ cargaUid: 'OTRO' })]);

      expect(await useCase.execute(ENVIO)).toEqual({ tipo: 'SIN_RESPUESTA' });
      nadaMarcado();
    });
  });

  /*
   * El servidor todavía no tiene la consulta (404/405): la única forma de saber es
   * mandar el payload guardado idéntico. Es seguro porque el TAG está bloqueado y
   * no cambió, y el servidor reconoce el envío por su uid.
   */
  describe('la consulta no existe en el servidor', () => {
    beforeEach(() => estadoApi.consultar.and.rejectWith(new ApiError('No encontrado', 404)));

    it('reenvía el payload guardado, tal cual, al endpoint de envío', async () => {
      await useCase.execute(ENVIO);

      expect(api.post).toHaveBeenCalledOnceWith(environment.tagFinalizadoEndpoint, JSON.parse(PAYLOAD));
    });

    it('si llega: enviado, con el total de productos que contesta el servidor', async () => {
      api.post.and.resolveTo({ total_productos: 4 } as never);

      expect(await useCase.execute(ENVIO)).toEqual({ tipo: 'ENVIADO', conDiferencias: false });
      expect(repo.marcarEnviado).toHaveBeenCalledOnceWith(UID, 4);
    });

    it('también con un 405', async () => {
      estadoApi.consultar.and.rejectWith(new ApiError('Metodo no permitido', 405));

      await useCase.execute(ENVIO);

      expect(api.post).toHaveBeenCalled();
    });

    it('si el servidor lo rechaza (400): no recibido', async () => {
      api.post.and.rejectWith(new ApiError('Falta TAG.', 400));

      expect(await useCase.execute(ENVIO)).toEqual({ tipo: 'NO_RECIBIDO', conflicto: false });
      expect(repo.marcarError).toHaveBeenCalledOnceWith(UID, 'Falta TAG.');
    });

    it('si se corta de nuevo: sigue en duda, anotado como tal', async () => {
      api.post.and.rejectWith(new NetworkError('El servidor no respondió a tiempo.'));

      expect(await useCase.execute(ENVIO)).toEqual({ tipo: 'SIN_RESPUESTA' });
      expect(repo.marcarSinRespuesta).toHaveBeenCalledOnceWith(UID, 'El servidor no respondió a tiempo.');
      expect(repo.marcarError).not.toHaveBeenCalled();
    });

    it('si dice que ya lo tiene con otra cantidad (409): enviado con diferencias', async () => {
      api.post.and.rejectWith(new ApiError('x', 409, 'CARGA_EXISTENTE_DISTINTA', { lecturas_servidor: 1, lecturas_enviadas: 3 }));

      expect(await useCase.execute(ENVIO)).toEqual({ tipo: 'ENVIADO', conDiferencias: true });
    });

    it('un 409 sin datos (servidor anterior): enviado, anotando que no se pudo comparar', async () => {
      api.post.and.rejectWith(new ApiError('El envio ya existe...', 409, null));

      expect(await useCase.execute(ENVIO)).toEqual({ tipo: 'ENVIADO', conDiferencias: true });
      expect(repo.marcarEnviadoConDiferencias).toHaveBeenCalledWith(UID, 1, jasmine.stringMatching(/no se pudo comparar/));
    });

    it('un 409 de otro TAG: conflicto, no se da por enviado', async () => {
      api.post.and.rejectWith(new ApiError('x', 409, 'CARGA_EXISTENTE_OTRO_TAG'));

      expect(await useCase.execute(ENVIO)).toEqual({ tipo: 'NO_RECIBIDO', conflicto: true });
      expect(repo.marcarEnviado).not.toHaveBeenCalled();
    });

    it('sin payload guardado no hay qué reenviar: sigue en duda', async () => {
      expect(await useCase.execute({ cargaUid: UID, payloadJson: null })).toEqual({ tipo: 'SIN_RESPUESTA' });
      expect(api.post).not.toHaveBeenCalled();
    });

    it('con un payload ilegible tampoco', async () => {
      expect(await useCase.execute({ cargaUid: UID, payloadJson: '{roto' })).toEqual({ tipo: 'SIN_RESPUESTA' });
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  /*
   * El 409 del servidor nuevo trae el `codigo` y los conteos: casi siempre
   * alcanza sin consultar.
   */
  describe('cuando el envío falló con un 409', () => {
    const conflicto = (codigo: string | null, datos: unknown = null) => new ApiError('x', 409, codigo, datos);

    it('CARGA_EXISTENTE_DISTINTA con conteos: enviado con diferencias, SIN consultar', async () => {
      const r = await useCase.execute(ENVIO, conflicto('CARGA_EXISTENTE_DISTINTA', { lecturas_servidor: 1, lecturas_enviadas: 3 }));

      expect(r).toEqual({ tipo: 'ENVIADO', conDiferencias: true });
      expect(estadoApi.consultar).not.toHaveBeenCalled();
      expect(repo.marcarEnviadoConDiferencias).toHaveBeenCalledOnceWith(UID, 1, jasmine.stringMatching(/1 lectura\(s\) y la PDA tiene 3/));
    });

    it('si los conteos coinciden con los de la PDA, no hay diferencias', async () => {
      const r = await useCase.execute(ENVIO, conflicto('CARGA_EXISTENTE_DISTINTA', { lecturas_servidor: 3 }));

      expect(r).toEqual({ tipo: 'ENVIADO', conDiferencias: false });
      expect(estadoApi.consultar).not.toHaveBeenCalled();
    });

    it('CARGA_EXISTENTE_OTRO_TAG: conflicto, SIN consultar y sin darlo por enviado', async () => {
      const r = await useCase.execute(ENVIO, conflicto('CARGA_EXISTENTE_OTRO_TAG'));

      expect(r).toEqual({ tipo: 'NO_RECIBIDO', conflicto: true });
      expect(estadoApi.consultar).not.toHaveBeenCalled();
      expect(repo.marcarEnviado).not.toHaveBeenCalled();
    });

    it('CARGA_EXISTENTE_OTRA_AGENDA: conflicto igual', async () => {
      expect(await useCase.execute(ENVIO, conflicto('CARGA_EXISTENTE_OTRA_AGENDA'))).toEqual({ tipo: 'NO_RECIBIDO', conflicto: true });
    });

    // Un servidor anterior no manda código ni conteos: hay que consultar.
    it('sin código (servidor anterior): consulta para confirmar la identidad', async () => {
      const r = await useCase.execute(ENVIO, conflicto(null));

      expect(estadoApi.consultar).toHaveBeenCalledOnceWith([UID]);
      expect(r.tipo).toBe('ENVIADO');
    });

    it('sin código y con una identidad ajena en la consulta: conflicto', async () => {
      estadoApi.consultar.and.resolveTo([estado({ tagCodigo: '9999' })]);

      expect(await useCase.execute(ENVIO, conflicto(null))).toEqual({ tipo: 'NO_RECIBIDO', conflicto: true });
    });

    it('CARGA_EXISTENTE_DISTINTA sin conteos utilizables: consulta', async () => {
      await useCase.execute(ENVIO, conflicto('CARGA_EXISTENTE_DISTINTA', { lecturas_servidor: 'x' }));

      expect(estadoApi.consultar).toHaveBeenCalled();
    });
  });

  describe('resolverConEstado (para la reconciliación en lote)', () => {
    it('aplica la misma regla sin consultar', async () => {
      const r = await useCase.resolverConEstado(ENVIO, estado());

      expect(r.tipo).toBe('ENVIADO');
      expect(estadoApi.consultar).not.toHaveBeenCalled();
    });

    it('"no existe" sobre una fila que ya es error no la vuelve a escribir', async () => {
      const r = await useCase.resolverConEstado(ENVIO, estado({ existe: false }), { yaEsError: true });

      expect(r).toEqual({ tipo: 'NO_RECIBIDO', conflicto: false });
      expect(repo.marcarError).not.toHaveBeenCalled();
    });

    it('"no existe" sobre una fila en duda sí la anota', async () => {
      await useCase.resolverConEstado(ENVIO, estado({ existe: false }));

      expect(repo.marcarError).toHaveBeenCalledOnceWith(UID, MENSAJE_NO_RECIBIDO);
    });

    it('un conflicto de identidad se anota aunque la fila ya fuera error', async () => {
      await useCase.resolverConEstado(ENVIO, estado({ tagCodigo: '9999' }), { yaEsError: true });

      expect(repo.marcarError).toHaveBeenCalledOnceWith(UID, MENSAJE_CONFLICTO);
    });
  });
});
