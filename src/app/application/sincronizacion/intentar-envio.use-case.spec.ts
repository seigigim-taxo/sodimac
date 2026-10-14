import { TestBed } from '@angular/core/testing';
import { IntentarEnvioUseCase } from './intentar-envio.use-case';
import { MENSAJE_CONFLICTO, MENSAJE_NO_RECIBIDO, ResolverEnvioUseCase } from './resolver-envio.use-case';
import { SINCRONIZACION_REPOSITORY_TOKEN, SincronizacionRepository } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { ESTADO_CARGAS_API_REPOSITORY_TOKEN, EstadoCargaServidor, EstadoCargasApiRepository } from '../../domain/sincronizacion/repositories/estado-cargas-api.repository';
import { ApiService } from '../../core/http/api.service';
import { ApiError } from '../../domain/shared/errors/api.error';
import { NetworkError } from '../../domain/shared/errors/network.error';
import { environment } from '../../../environments/environment';

/*
 * Un intento de envío: mandar, clasificar lo que pasó, preguntar si hace falta, y
 * dejar anotado el resultado.
 *
 * Usa el ResolverEnvioUseCase real: lo que importa es el conjunto — qué queda
 * anotado y cuántas veces se llama al servidor.
 *
 * La línea que más se cuida: un TAG que ya estaba EN DUDA no pasa a "no recibido"
 * porque un reintento falle. Eso volvería editable un TAG que el servidor quizá
 * ya tiene, que es el origen de todo este arreglo.
 */
const UID = 'UID-1';
const PAYLOAD = {
  carga_uid: UID, codigo_tienda: '4093', tag_codigo: '7001', iteracion: 1, numero_agenda: 'AG-1',
  detalles: [{ sku: 'A', lecturas: [{ lectura_uid: 'L1' }, { lectura_uid: 'L2' }, { lectura_uid: 'L3' }] }],
};
const ENVIO = { cargaUid: UID, payload: PAYLOAD, payloadJson: JSON.stringify(PAYLOAD), previoEnDuda: false };

const servidor = (extra: Partial<EstadoCargaServidor> = {}): EstadoCargaServidor => ({
  cargaUid: UID, existe: true, estado: 'RECIBIDO', totalLecturas: 3, totalUnidades: 3,
  codigoTienda: '4093', tagCodigo: '7001', iteracion: 1, numeroAgenda: 'AG-1', ...extra,
});

const NO_EXISTE = servidor({
  existe: false, estado: null, totalLecturas: null, totalUnidades: null,
  codigoTienda: null, tagCodigo: null, iteracion: null, numeroAgenda: null,
});

describe('IntentarEnvioUseCase', () => {
  let useCase: IntentarEnvioUseCase;
  let repo: jasmine.SpyObj<SincronizacionRepository>;
  let estadoApi: jasmine.SpyObj<EstadoCargasApiRepository>;
  let api: jasmine.SpyObj<ApiService>;

  const corte = () => new NetworkError('El servidor no respondió a tiempo.', true, true);
  const sinRed = () => new NetworkError('Sin conexión con el servidor.', true, false);

  beforeEach(() => {
    repo = jasmine.createSpyObj<SincronizacionRepository>('SincronizacionRepository', [
      'marcarEnviado', 'marcarEnviadoConDiferencias', 'marcarError', 'marcarSinRespuesta',
    ]);
    repo.marcarEnviado.and.resolveTo();
    repo.marcarEnviadoConDiferencias.and.resolveTo();
    repo.marcarError.and.resolveTo();
    repo.marcarSinRespuesta.and.resolveTo();

    estadoApi = jasmine.createSpyObj<EstadoCargasApiRepository>('EstadoCargasApiRepository', ['consultar']);
    estadoApi.consultar.and.resolveTo([servidor()]);

    api = jasmine.createSpyObj<ApiService>('ApiService', ['post']);
    api.post.and.resolveTo({ total_productos: 3 } as never);

    TestBed.configureTestingModule({
      providers: [
        IntentarEnvioUseCase,
        ResolverEnvioUseCase,
        { provide: SINCRONIZACION_REPOSITORY_TOKEN, useValue: repo },
        { provide: ESTADO_CARGAS_API_REPOSITORY_TOKEN, useValue: estadoApi },
        { provide: ApiService, useValue: api },
      ],
    });
    useCase = TestBed.inject(IntentarEnvioUseCase);
  });

  describe('el envío llega', () => {
    it('manda el payload al endpoint de TAG y lo anota enviado', async () => {
      const r = await useCase.execute(ENVIO);

      expect(r).toEqual({ tipo: 'ENVIADO', conDiferencias: false });
      expect(api.post).toHaveBeenCalledOnceWith(environment.tagFinalizadoEndpoint, PAYLOAD);
      expect(repo.marcarEnviado).toHaveBeenCalledOnceWith(UID, 3);
    });

    it('no consulta al servidor: no hace falta', async () => {
      await useCase.execute(ENVIO);

      expect(estadoApi.consultar).not.toHaveBeenCalled();
    });

    it('si la respuesta no trae el total de productos, anota cero', async () => {
      api.post.and.resolveTo({} as never);

      await useCase.execute(ENVIO);

      expect(repo.marcarEnviado).toHaveBeenCalledOnceWith(UID, 0);
    });

    // Un fallo al anotar en la base local NO es un fallo del envío: el servidor
    // sí respondió. Mezclarlos lo tomaría por "no se supo qué pasó".
    it('si falla al anotar en la base, el error sube y NO se toma por una duda del envío', async () => {
      repo.marcarEnviado.and.rejectWith(new Error('disco lleno'));

      await expectAsync(useCase.execute(ENVIO)).toBeRejectedWithError('disco lleno');
      expect(repo.marcarSinRespuesta).not.toHaveBeenCalled();
      expect(repo.marcarError).not.toHaveBeenCalled();
    });
  });

  describe('no llegó: se sabe que el servidor no lo tiene', () => {
    it('sin red: se anota como error, sin consultar ni reintentar', async () => {
      api.post.and.rejectWith(sinRed());

      const r = await useCase.execute(ENVIO);

      expect(r).toEqual({ tipo: 'NO_RECIBIDO', conflicto: false, error: 'Sin conexión con el servidor.', porRed: true });
      expect(repo.marcarError).toHaveBeenCalledOnceWith(UID, 'Sin conexión con el servidor.');
      expect(estadoApi.consultar).not.toHaveBeenCalled();
      expect(api.post).toHaveBeenCalledTimes(1);
    });

    it('el servidor lo rechazó (400): error, sin consultar', async () => {
      api.post.and.rejectWith(new ApiError('Falta TAG.', 400));

      const r = await useCase.execute(ENVIO);

      expect(r).toEqual({ tipo: 'NO_RECIBIDO', conflicto: false, error: 'Falta TAG.' });
      expect(estadoApi.consultar).not.toHaveBeenCalled();
    });

    // Algo que ni siquiera es un Error no se reconoce: queda en duda (la regla
    // ante lo desconocido) y se anota con un mensaje genérico.
    it('un fallo que no es un Error queda en duda, con un mensaje genérico', async () => {
      api.post.and.rejectWith('algo raro');
      estadoApi.consultar.and.rejectWith(sinRed());

      const r = await useCase.execute(ENVIO);

      expect(r).toEqual({ tipo: 'EN_DUDA', error: 'Error al enviar conteo al servidor' });
      expect(repo.marcarSinRespuesta).toHaveBeenCalledOnceWith(UID, 'Error al enviar conteo al servidor');
      expect(repo.marcarError).not.toHaveBeenCalled();
    });
  });

  /*
   * LA LÍNEA QUE MÁS SE CUIDA. Un envío que ya estaba en duda no baja a "no
   * recibido" por un fallo de ESTE intento: que ahora no haya red, o que el
   * servidor rechace esta solicitud, no dice nada del intento anterior.
   */
  describe('el envío YA estaba en duda', () => {
    const enDuda = { ...ENVIO, previoEnDuda: true };

    it('sin red ahora: sigue en duda, NO pasa a error', async () => {
      api.post.and.rejectWith(sinRed());
      estadoApi.consultar.and.rejectWith(sinRed());

      const r = await useCase.execute(enDuda);

      expect(r.tipo).toBe('EN_DUDA');
      expect(repo.marcarSinRespuesta).toHaveBeenCalled();
      expect(repo.marcarError).not.toHaveBeenCalled();
    });

    it('el servidor rechaza esta solicitud (500): sigue en duda, NO pasa a error', async () => {
      api.post.and.rejectWith(new ApiError('No pudimos guardar el TAG.', 500));
      estadoApi.consultar.and.rejectWith(sinRed());

      const r = await useCase.execute(enDuda);

      expect(r.tipo).toBe('EN_DUDA');
      expect(repo.marcarError).not.toHaveBeenCalled();
    });

    it('lo mismo sin el aviso previo: el mismo fallo, con el envío NO en duda, sí es error', async () => {
      api.post.and.rejectWith(new ApiError('No pudimos guardar el TAG.', 500));

      const r = await useCase.execute({ ...ENVIO, previoEnDuda: false });

      expect(r.tipo).toBe('NO_RECIBIDO');
      expect(repo.marcarError).toHaveBeenCalled();
    });

    it('pero si el servidor confirma que NO lo tiene, ahí sí se resuelve y se reenvía', async () => {
      api.post.and.rejectWith(sinRed());
      estadoApi.consultar.and.resolveTo([NO_EXISTE]);
      api.post.and.returnValues(Promise.reject(sinRed()), Promise.resolve({ total_productos: 3 } as never));

      const r = await useCase.execute(enDuda);

      expect(r.tipo).toBe('ENVIADO');
      expect(api.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('se cortó o no volvió respuesta (en duda)', () => {
    beforeEach(() => api.post.and.rejectWith(corte()));

    it('lo anota sin respuesta y pregunta al servidor', async () => {
      await useCase.execute(ENVIO);

      expect(repo.marcarSinRespuesta).toHaveBeenCalledOnceWith(UID, 'El servidor no respondió a tiempo.');
      expect(estadoApi.consultar).toHaveBeenCalledOnceWith([UID]);
    });

    // El caso del TAG 7001: el servidor lo guardó y la respuesta se perdió.
    it('el servidor lo tiene: queda ENVIADO y NO se reenvía', async () => {
      const r = await useCase.execute(ENVIO);

      expect(r).toEqual({ tipo: 'ENVIADO', conDiferencias: false });
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(repo.marcarEnviado).toHaveBeenCalledOnceWith(UID, 1);
    });

    it('el servidor lo tiene con otro contenido: ENVIADO, con diferencias', async () => {
      estadoApi.consultar.and.resolveTo([servidor({ totalLecturas: 1 })]);

      expect(await useCase.execute(ENVIO)).toEqual({ tipo: 'ENVIADO', conDiferencias: true });
    });

    it('no se pudo preguntar: sigue en duda, y NO se reenvía a ciegas', async () => {
      estadoApi.consultar.and.rejectWith(sinRed());

      const r = await useCase.execute(ENVIO);

      expect(r).toEqual({ tipo: 'EN_DUDA', error: 'El servidor no respondió a tiempo.', porRed: true });
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(repo.marcarError).not.toHaveBeenCalled();
    });

    it('el uid es de otro TAG: conflicto, no se da por enviado ni se reenvía', async () => {
      estadoApi.consultar.and.resolveTo([servidor({ tagCodigo: '9999' })]);

      const r = await useCase.execute(ENVIO);

      expect(r).toEqual({ tipo: 'NO_RECIBIDO', conflicto: true, error: MENSAJE_CONFLICTO });
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(repo.marcarEnviado).not.toHaveBeenCalled();
    });

    describe('el servidor confirma que NO lo tiene', () => {
      beforeEach(() => estadoApi.consultar.and.resolveTo([NO_EXISTE]));

      it('lo reenvía UNA vez, y si llega queda enviado', async () => {
        api.post.and.returnValues(Promise.reject(corte()), Promise.resolve({ total_productos: 3 } as never));

        const r = await useCase.execute(ENVIO);

        expect(r).toEqual({ tipo: 'ENVIADO', conDiferencias: false });
        expect(api.post).toHaveBeenCalledTimes(2);
        expect(repo.marcarEnviado).toHaveBeenCalledOnceWith(UID, 3);
      });

      it('si el reenvío también falla sin red: queda como error (ahora sí se sabe)', async () => {
        api.post.and.returnValues(Promise.reject(corte()), Promise.reject(sinRed()));

        const r = await useCase.execute(ENVIO);

        expect(r).toEqual({ tipo: 'NO_RECIBIDO', conflicto: false, error: 'Sin conexión con el servidor.', porRed: true });
        expect(api.post).toHaveBeenCalledTimes(2);
      });

      it('si el reenvío se corta de nuevo: vuelve a estar en duda', async () => {
        api.post.and.returnValues(Promise.reject(corte()), Promise.reject(corte()));

        const r = await useCase.execute(ENVIO);

        expect(r.tipo).toBe('EN_DUDA');
        expect(repo.marcarSinRespuesta).toHaveBeenCalledTimes(2);
      });

      it('NUNCA reenvía más de una vez', async () => {
        api.post.and.rejectWith(corte());

        await useCase.execute(ENVIO);

        expect(api.post).toHaveBeenCalledTimes(2);
      });

      it('si en el reenvío aparece un 409 con otro contenido: enviado con diferencias', async () => {
        api.post.and.returnValues(
          Promise.reject(corte()),
          Promise.reject(new ApiError('x', 409, 'CARGA_EXISTENTE_DISTINTA', { lecturas_servidor: 1 })),
        );

        expect(await useCase.execute(ENVIO)).toEqual({ tipo: 'ENVIADO', conDiferencias: true });
      });

      it('si en el reenvío aparece un 409 de otro TAG: conflicto', async () => {
        api.post.and.returnValues(Promise.reject(corte()), Promise.reject(new ApiError('x', 409, 'CARGA_EXISTENTE_OTRO_TAG')));

        expect(await useCase.execute(ENVIO)).toEqual({ tipo: 'NO_RECIBIDO', conflicto: true, error: MENSAJE_CONFLICTO });
      });

      it('lo que se anotó queda coherente: "no recibió" y después "enviado"', async () => {
        api.post.and.returnValues(Promise.reject(corte()), Promise.resolve({ total_productos: 3 } as never));

        await useCase.execute(ENVIO);

        expect(repo.marcarError).toHaveBeenCalledOnceWith(UID, MENSAJE_NO_RECIBIDO);
        expect(repo.marcarEnviado).toHaveBeenCalledTimes(1);
      });
    });

    it('la consulta no existe en el servidor: cae al reenvío idéntico', async () => {
      estadoApi.consultar.and.rejectWith(new ApiError('No encontrado', 404));
      api.post.and.returnValues(Promise.reject(corte()), Promise.resolve({ total_productos: 3 } as never));

      const r = await useCase.execute(ENVIO);

      expect(r.tipo).toBe('ENVIADO');
      expect(api.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('el servidor dice que ya existe (409)', () => {
    it('con el código y los conteos: enviado con diferencias, sin consultar ni reenviar', async () => {
      api.post.and.rejectWith(new ApiError('x', 409, 'CARGA_EXISTENTE_DISTINTA', { lecturas_servidor: 1, lecturas_enviadas: 3 }));

      const r = await useCase.execute(ENVIO);

      expect(r).toEqual({ tipo: 'ENVIADO', conDiferencias: true });
      expect(estadoApi.consultar).not.toHaveBeenCalled();
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(repo.marcarSinRespuesta).not.toHaveBeenCalled();
    });

    it('de otro TAG: conflicto, no se da por enviado', async () => {
      api.post.and.rejectWith(new ApiError('x', 409, 'CARGA_EXISTENTE_OTRO_TAG'));

      const r = await useCase.execute(ENVIO);

      expect(r).toEqual({ tipo: 'NO_RECIBIDO', conflicto: true, error: MENSAJE_CONFLICTO });
      expect(repo.marcarEnviado).not.toHaveBeenCalled();
      expect(api.post).toHaveBeenCalledTimes(1);
    });

    it('sin código (servidor anterior): consulta para confirmar la identidad', async () => {
      api.post.and.rejectWith(new ApiError('El envio ya existe...', 409, null));

      const r = await useCase.execute(ENVIO);

      expect(estadoApi.consultar).toHaveBeenCalledOnceWith([UID]);
      expect(r.tipo).toBe('ENVIADO');
    });
  });

  /*
   * `porRed` le dice a "Enviar pendientes" que no siga probando con los demás: si
   * la red no anda para uno, tampoco para el resto, y cada intento puede tardar
   * hasta 30 s en fallar.
   */
  describe('si el fallo fue por la red', () => {
    it('sin red: lo marca', async () => {
      api.post.and.rejectWith(sinRed());

      expect(await useCase.execute(ENVIO)).toEqual(jasmine.objectContaining({ porRed: true }));
    });

    it('un corte a mitad de camino: lo marca', async () => {
      api.post.and.rejectWith(corte());
      estadoApi.consultar.and.rejectWith(corte());

      expect(await useCase.execute(ENVIO)).toEqual(jasmine.objectContaining({ tipo: 'EN_DUDA', porRed: true }));
    });

    it('el servidor lo rechazó (400): NO es la red', async () => {
      api.post.and.rejectWith(new ApiError('Falta TAG.', 400));

      expect((await useCase.execute(ENVIO) as { porRed?: boolean }).porRed).toBeUndefined();
    });

    it('si llegó, no hay nada que marcar', async () => {
      api.post.and.resolveTo({ total_productos: 3 } as never);

      expect(await useCase.execute(ENVIO)).toEqual({ tipo: 'ENVIADO', conDiferencias: false });
    });

    // El primer POST se cortó, pero la consulta SÍ llegó al servidor: la red anda.
    it('un conflicto que el servidor respondió por consulta: NO es la red', async () => {
      api.post.and.rejectWith(corte());
      estadoApi.consultar.and.resolveTo([servidor({ tagCodigo: '9999' })]);

      const r = await useCase.execute(ENVIO);

      expect(r).toEqual({ tipo: 'NO_RECIBIDO', conflicto: true, error: MENSAJE_CONFLICTO });
    });

    // El segundo POST fue rechazado por el servidor: la última falla ya no es de red.
    it('si el reenvío lo rechaza el servidor, el último fallo no es de red', async () => {
      api.post.and.returnValues(Promise.reject(corte()), Promise.reject(new ApiError('Falta TAG.', 400)));
      estadoApi.consultar.and.resolveTo([NO_EXISTE]);

      expect((await useCase.execute(ENVIO) as { porRed?: boolean }).porRed).toBeUndefined();
    });
  });
});
