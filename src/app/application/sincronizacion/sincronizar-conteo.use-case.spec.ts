import { TestBed } from '@angular/core/testing';
import { SincronizarConteoUseCase } from './sincronizar-conteo.use-case';
import { SincronizarTagFinalizadoUseCase } from './sincronizar-tag-finalizado.use-case';
import { CONTEO_REPOSITORY_TOKEN, ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
import { TagFinalizadoPayload } from '../../domain/sincronizacion/models/tag-finalizado.model';
import { EnvioFallidoError } from '../../domain/shared/errors/envio-fallido.error';

/*
 * Caracteriza el paso previo y posterior al POST de un TAG: arma el payload con
 * las líneas FINALIZADAS, lo manda y, solo si el servidor lo recibió, marca el
 * TAG como SINCRONIZADO.
 *
 * Esa segunda marca es DISTINTA de la que hace el envío en la cola
 * (marcarEnviado): son dos tablas y dos escrituras, y entre una y otra la app
 * puede morir. Esa brecha es parte de lo que se va a corregir.
 */
const RESUMEN: ConteoResumen = {
  conteoId: 10, eventoId: 10, ubicacionId: 228, operadorId: 1, pdaId: 1,
  estado: 'FINALIZADO', tag: '7001', zonaCodigo: 'OTRO', zonaNombre: 'Pto. vta. otros',
  totalProductos: 1, totalUnidades: 30, iteracion: 1, fechaUltima: '2026-10-05 10:19:34',
};

const PAYLOAD = { carga_uid: 'UID-1', tag_codigo: '7001' } as TagFinalizadoPayload;

describe('SincronizarConteoUseCase', () => {
  let useCase: SincronizarConteoUseCase;
  let conteoRepo: jasmine.SpyObj<ConteoRepository>;
  let syncTag: jasmine.SpyObj<SincronizarTagFinalizadoUseCase>;

  beforeEach(() => {
    conteoRepo = jasmine.createSpyObj<ConteoRepository>('ConteoRepository', [
      'getPayloadSincronizacion', 'marcarSincronizado',
    ]);
    conteoRepo.getPayloadSincronizacion.and.resolveTo(PAYLOAD);
    conteoRepo.marcarSincronizado.and.resolveTo();

    syncTag = jasmine.createSpyObj<SincronizarTagFinalizadoUseCase>('SincronizarTagFinalizadoUseCase', ['execute']);
    syncTag.execute.and.resolveTo({ ok: true, enviado: true });

    TestBed.configureTestingModule({
      providers: [
        SincronizarConteoUseCase,
        { provide: CONTEO_REPOSITORY_TOKEN, useValue: conteoRepo },
        { provide: SincronizarTagFinalizadoUseCase, useValue: syncTag },
      ],
    });
    useCase = TestBed.inject(SincronizarConteoUseCase);
  });

  describe('qué TAGs se pueden sincronizar', () => {
    it('solo uno FINALIZADO', async () => {
      await expectAsync(useCase.execute({ ...RESUMEN, estado: 'EN_CURSO' }))
        .toBeRejectedWithError('Solo un conteo finalizado se puede sincronizar');
    });

    it('uno ya SINCRONIZADO tampoco', async () => {
      await expectAsync(useCase.execute({ ...RESUMEN, estado: 'SINCRONIZADO' }))
        .toBeRejectedWithError('Solo un conteo finalizado se puede sincronizar');
    });

    it('y en ese caso no arma el payload ni toca el servidor', async () => {
      await useCase.execute({ ...RESUMEN, estado: 'EN_CURSO' }).catch(() => undefined);

      expect(conteoRepo.getPayloadSincronizacion).not.toHaveBeenCalled();
      expect(syncTag.execute).not.toHaveBeenCalled();
    });
  });

  describe('envío que llega', () => {
    it('manda a la cola el payload y los identificadores del TAG', async () => {
      await useCase.execute(RESUMEN);

      expect(syncTag.execute).toHaveBeenCalledOnceWith({
        eventoId: 10, pdaId: 1, iteracion: 1, perfil: 'OPERADOR',
        conteoId: 10, ubicacionId: 228, operadorId: 1,
        cargaUid: 'UID-1', payload: PAYLOAD,
      });
    });

    it('el carga_uid de la cola sale del payload, no se inventa aparte', async () => {
      conteoRepo.getPayloadSincronizacion.and.resolveTo({ ...PAYLOAD, carga_uid: 'OTRO-UID' });

      await useCase.execute(RESUMEN);

      expect(syncTag.execute.calls.mostRecent().args[0].cargaUid).toBe('OTRO-UID');
    });

    it('marca el TAG como SINCRONIZADO', async () => {
      await useCase.execute(RESUMEN);

      expect(conteoRepo.marcarSincronizado).toHaveBeenCalledOnceWith(10, 228, 1, 1);
    });
  });

  describe('envío que falla', () => {
    beforeEach(() => {
      syncTag.execute.and.resolveTo({ ok: false, enviado: false, error: 'Sin conexión con el servidor.' });
    });

    it('lanza el error con el mensaje del envío', async () => {
      await expectAsync(useCase.execute(RESUMEN)).toBeRejectedWithError('Sin conexión con el servidor.');
    });

    it('NO marca el TAG como SINCRONIZADO: sigue pendiente y editable', async () => {
      await useCase.execute(RESUMEN).catch(() => undefined);

      expect(conteoRepo.marcarSincronizado).not.toHaveBeenCalled();
    });

    it('sin mensaje usa uno genérico', async () => {
      syncTag.execute.and.resolveTo({ ok: false, enviado: false });

      await expectAsync(useCase.execute(RESUMEN)).toBeRejectedWithError('Error al sincronizar conteo');
    });
  });

  /*
   * "No se envió" y "no sabemos si se envió" no son lo mismo para el operador:
   * en el primero se puede reintentar sin riesgo; en el segundo el servidor pudo
   * haber guardado el TAG. El error lleva esa diferencia hasta la pantalla.
   */
  describe('qué le dice a la pantalla cuando falla', () => {
    const falla = (extra: Record<string, unknown>) =>
      syncTag.execute.and.resolveTo({ ok: false, enviado: false, error: 'x', ...extra });

    const capturar = async (): Promise<EnvioFallidoError> => {
      try {
        await useCase.execute(RESUMEN);
      } catch (e) {
        return e as EnvioFallidoError;
      }
      throw new Error('Se esperaba un error');
    };

    it('lanza un EnvioFallidoError, que sigue siendo un Error con el mensaje', async () => {
      falla({});

      const e = await capturar();

      expect(e).toBeInstanceOf(EnvioFallidoError);
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toBe('x');
    });

    it('un fallo común no es una duda', async () => {
      falla({});

      const e = await capturar();

      expect([e.enDuda, e.conflicto, e.cambioTrasEnvio]).toEqual([false, false, false]);
    });

    it('si no se pudo averiguar, lo marca EN DUDA', async () => {
      falla({ enDuda: true });

      expect((await capturar()).enDuda).toBeTrue();
    });

    it('si el identificador es de otro TAG, lo marca como conflicto', async () => {
      falla({ conflicto: true });

      expect((await capturar()).conflicto).toBeTrue();
    });

    it('si otro envío del mismo TAG está en marcha, lo marca', async () => {
      falla({ yaSeEnvia: true });

      expect((await capturar()).yaSeEnvia).toBeTrue();
    });

    it('un fallo común no es "ya se envía"', async () => {
      falla({});

      expect((await capturar()).yaSeEnvia).toBeFalse();
    });

    it('si el TAG cambió después de un envío, lo marca', async () => {
      falla({ cambioTrasEnvio: true });

      expect((await capturar()).cambioTrasEnvio).toBeTrue();
    });

    it('en ninguno de esos casos marca el TAG como sincronizado', async () => {
      for (const extra of [{}, { enDuda: true }, { conflicto: true }, { cambioTrasEnvio: true }, { yaSeEnvia: true }]) {
        falla(extra);
        await capturar();
      }

      expect(conteoRepo.marcarSincronizado).not.toHaveBeenCalled();
    });
  });

  /*
   * Que el servidor ya tuviera el TAG (porque la respuesta de un envío anterior se
   * perdió) NO es un fallo: se marca como sincronizado igual. Eso también repara
   * el TAG que quedó FINALIZADO aunque su envío figurara recibido.
   */
  describe('cuando el servidor ya lo tenía', () => {
    it('lo marca como sincronizado', async () => {
      syncTag.execute.and.resolveTo({ ok: true, enviado: true, yaEstabaEnviado: true });

      await useCase.execute(RESUMEN);

      expect(conteoRepo.marcarSincronizado).toHaveBeenCalledOnceWith(10, 228, 1, 1);
    });

    it('con otro contenido también', async () => {
      syncTag.execute.and.resolveTo({ ok: true, enviado: true, conDiferencias: true });

      await expectAsync(useCase.execute(RESUMEN)).toBeResolved();
      expect(conteoRepo.marcarSincronizado).toHaveBeenCalled();
    });
  });

  /*
   * La brecha: el envío ya quedó anotado como ENVIADO en la cola, pero si
   * marcarSincronizado falla (o la app muere antes), el TAG sigue FINALIZADO y
   * por lo tanto editable aunque el servidor ya lo tenga.
   */
  it('si marcar el TAG falla después de un envío exitoso, el error sube y el TAG queda FINALIZADO', async () => {
    conteoRepo.marcarSincronizado.and.rejectWith(new Error('disco lleno'));

    await expectAsync(useCase.execute(RESUMEN)).toBeRejectedWithError('disco lleno');
    expect(syncTag.execute).toHaveBeenCalled();
  });
});
