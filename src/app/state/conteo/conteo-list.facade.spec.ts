import { TestBed } from '@angular/core/testing';
import { ConteoListFacade } from './conteo-list.facade';
import { GetConteosUseCase } from '../../application/conteo/get-conteos.use-case';
import { GetRondaActivaUseCase } from '../../application/conteo/get-ronda-activa.use-case';
import { DeleteConteoSesionUseCase } from '../../application/conteo/delete-conteo-sesion.use-case';
import { SincronizarConteoUseCase } from '../../application/sincronizacion/sincronizar-conteo.use-case';
import { GetTagsReconteoUseCase } from '../../application/conteo/get-tags-reconteo.use-case';
import { ReabrirTagUseCase } from '../../application/conteo/reabrir-tag.use-case';
import { ConsultarEnviosTagUseCase, clavePorTag } from '../../application/conteo/consultar-envios-tag.use-case';
import { ReintentoAutomaticoService } from '../../shared/services/reintento-automatico.service';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
import { EstadoConteo } from '../../domain/conteo/models/estado-conteo.model';
import { EnvioFallidoError } from '../../domain/shared/errors/envio-fallido.error';

/*
 * Los ids importan y son todos números: eventoId, conteoId y ubicacionId se
 * eligen distintos a propósito, para que confundirlos rompa la prueba.
 */
function resumen(over: Partial<ConteoResumen> = {}): ConteoResumen {
  return {
    conteoId: 30, eventoId: 7, ubicacionId: 11, operadorId: 4, pdaId: 2,
    estado: 'FINALIZADO' as EstadoConteo, tag: '104',
    zonaCodigo: 'SALA_VENTAS', zonaNombre: 'Sala de ventas',
    totalProductos: 5, totalUnidades: 14, iteracion: 1,
    fechaUltima: '2026-08-18 10:00:00',
    ...over,
  };
}

describe('ConteoListFacade', () => {
  let facade: ConteoListFacade;
  let getConteos: jasmine.SpyObj<GetConteosUseCase>;
  let deleteSesion: jasmine.SpyObj<DeleteConteoSesionUseCase>;
  let reabrirTag: jasmine.SpyObj<ReabrirTagUseCase>;
  let sincronizarUC: jasmine.SpyObj<SincronizarConteoUseCase>;
  let consultarEnvios: jasmine.SpyObj<ConsultarEnviosTagUseCase>;
  let reintento: jasmine.SpyObj<ReintentoAutomaticoService>;

  beforeEach(() => {
    getConteos   = jasmine.createSpyObj('GetConteosUseCase', ['execute']);
    deleteSesion = jasmine.createSpyObj('DeleteConteoSesionUseCase', ['execute']);
    reabrirTag   = jasmine.createSpyObj('ReabrirTagUseCase', ['execute']);
    sincronizarUC = jasmine.createSpyObj('SincronizarConteoUseCase', ['execute']);
    sincronizarUC.execute.and.resolveTo();
    consultarEnvios = jasmine.createSpyObj('ConsultarEnviosTagUseCase', ['execute']);
    consultarEnvios.execute.and.resolveTo(new Map());
    reintento = jasmine.createSpyObj('ReintentoAutomaticoService', ['programarTrasFallo']);
    deleteSesion.execute.and.resolveTo();
    reabrirTag.execute.and.resolveTo();

    TestBed.configureTestingModule({
      providers: [
        ConteoListFacade,
        { provide: GetConteosUseCase, useValue: getConteos },
        { provide: DeleteConteoSesionUseCase, useValue: deleteSesion },
        { provide: ReabrirTagUseCase, useValue: reabrirTag },
        { provide: GetRondaActivaUseCase, useValue: jasmine.createSpyObj('GetRondaActivaUseCase', ['execute']) },
        { provide: SincronizarConteoUseCase, useValue: sincronizarUC },
        { provide: ConsultarEnviosTagUseCase, useValue: consultarEnvios },
        { provide: ReintentoAutomaticoService, useValue: reintento },
        { provide: GetTagsReconteoUseCase, useValue: jasmine.createSpyObj('GetTagsReconteoUseCase', ['execute']) },
      ],
    });
    facade = TestBed.inject(ConteoListFacade);
  });

  /*
   * Las líneas cuelgan de la ronda: pasar el eventoId hacía que el DELETE no
   * encontrara nada mientras la lista sí quitaba la fila, así que el TAG
   * parecía borrado hasta la siguiente recarga.
   */
  it('elimina por la ronda, no por el evento', async () => {
    await facade.delete(resumen());

    expect(deleteSesion.execute).toHaveBeenCalledWith(30, 11, 4, 2, 'FINALIZADO');
  });

  it('quita de la lista solo la ronda eliminada', async () => {
    const ronda1 = resumen({ conteoId: 30, iteracion: 1 });
    const ronda2 = resumen({ conteoId: 31, iteracion: 2 });
    getConteos.execute.and.resolveTo([ronda1, ronda2]);
    await facade.load(4, 2);

    await facade.delete(ronda1);

    expect(facade.conteos().map((c) => c.iteracion)).toEqual([2]);
  });

  it('deja el mensaje y conserva la fila si el borrado falla', async () => {
    getConteos.execute.and.resolveTo([resumen()]);
    await facade.load(4, 2);
    deleteSesion.execute.and.rejectWith(new Error('Base local no disponible'));

    await facade.delete(resumen());

    expect(facade.error()).toBe('Base local no disponible');
    expect(facade.conteos().length).toBe(1);
  });

  it('reabre el TAG y lo devuelve a EN_CURSO en la lista', async () => {
    getConteos.execute.and.resolveTo([resumen()]);
    await facade.load(4, 2);

    const reabierto = await facade.reabrir(resumen());

    expect(reabierto).toBeTrue();
    expect(reabrirTag.execute).toHaveBeenCalledWith(jasmine.objectContaining({ conteoId: 30 }));
    expect(facade.conteos()[0].estado).toBe('EN_CURSO');
  });

  it('avisa sin reabrir cuando el caso de uso rechaza', async () => {
    reabrirTag.execute.and.rejectWith(new Error('Este TAG ya se sincronizó y no se puede volver a abrir.'));

    expect(await facade.reabrir(resumen())).toBeFalse();
    expect(facade.error()).toContain('ya se sincronizó');
  });

  /*
   * La pantalla distingue dos fallos que antes se veían iguales: "no se envió" (el
   * servidor no tiene el TAG) y "no sabemos si se envió" (pudo haberlo guardado).
   */
  describe('sincronizar', () => {
    it('si llega, devuelve true, sin error ni duda', async () => {
      expect(await facade.sincronizar(resumen())).toBeTrue();
      expect(facade.error()).toBeNull();
      expect(facade.fallaEnDuda()).toBeFalse();
    });

    it('si llega, el TAG pasa a SINCRONIZADO en la lista', async () => {
      getConteos.execute.and.resolveTo([resumen()]);
      await facade.load(4, 2);

      await facade.sincronizar(resumen());

      expect(facade.conteos()[0].estado).toBe('SINCRONIZADO');
    });

    it('un fallo común deja el mensaje y NO es una duda', async () => {
      sincronizarUC.execute.and.rejectWith(new EnvioFallidoError('Sin conexión con el servidor.'));

      expect(await facade.sincronizar(resumen())).toBeFalse();
      expect(facade.error()).toBe('Sin conexión con el servidor.');
      expect(facade.fallaEnDuda()).toBeFalse();
    });

    it('si no se pudo averiguar si llegó, queda marcado EN DUDA', async () => {
      sincronizarUC.execute.and.rejectWith(new EnvioFallidoError('corte', { enDuda: true }));

      await facade.sincronizar(resumen());

      expect(facade.fallaEnDuda()).toBeTrue();
      expect(facade.error()).toBe('corte');
    });

    it('un Error cualquiera no cuenta como duda', async () => {
      sincronizarUC.execute.and.rejectWith(new Error('algo'));

      await facade.sincronizar(resumen());

      expect(facade.fallaEnDuda()).toBeFalse();
    });

    it('un conflicto de identificador no es una duda', async () => {
      sincronizarUC.execute.and.rejectWith(new EnvioFallidoError('x', { conflicto: true }));

      await facade.sincronizar(resumen());

      expect(facade.fallaEnDuda()).toBeFalse();
    });

    /*
     * Hallazgo de la prueba en la PDA: un TAG cuyo envío falló al finalizar no se
     * reintentaba solo hasta que algo más (red, volver a la app, Inicio) lo despertara.
     */
    describe('arma el reintento automático cuando el envío falla', () => {
      it('con un fallo común', async () => {
        sincronizarUC.execute.and.rejectWith(new EnvioFallidoError('Sin conexión.'));
        await facade.sincronizar(resumen());

        expect(reintento.programarTrasFallo).toHaveBeenCalledTimes(1);
      });

      it('con un envío en duda', async () => {
        sincronizarUC.execute.and.rejectWith(new EnvioFallidoError('corte', { enDuda: true }));
        await facade.sincronizar(resumen());

        expect(reintento.programarTrasFallo).toHaveBeenCalledTimes(1);
      });

      it('con un error cualquiera', async () => {
        sincronizarUC.execute.and.rejectWith(new Error('algo'));
        await facade.sincronizar(resumen());

        expect(reintento.programarTrasFallo).toHaveBeenCalledTimes(1);
      });

      for (const [nombre, detalle] of [
        ['un identificador ajeno', { conflicto: true }],
        ['un TAG que cambió después de enviarse', { cambioTrasEnvio: true }],
        ['otro envío del mismo TAG en marcha', { yaSeEnvia: true }],
      ] as const) {
        it(`NO con ${nombre}: reenviar no lo arregla`, async () => {
          sincronizarUC.execute.and.rejectWith(new EnvioFallidoError('x', detalle));
          await facade.sincronizar(resumen());

          expect(reintento.programarTrasFallo).not.toHaveBeenCalled();
        });
      }

      it('NO si el envío llegó', async () => {
        await facade.sincronizar(resumen());

        expect(reintento.programarTrasFallo).not.toHaveBeenCalled();
      });
    });

    it('motivoFalla: un fallo común es NO_ENVIADO', async () => {
      sincronizarUC.execute.and.rejectWith(new EnvioFallidoError('Sin conexión.'));
      await facade.sincronizar(resumen());

      expect(facade.motivoFalla()).toBe('NO_ENVIADO');
    });

    it('motivoFalla: sin poder averiguarlo es EN_DUDA', async () => {
      sincronizarUC.execute.and.rejectWith(new EnvioFallidoError('corte', { enDuda: true }));
      await facade.sincronizar(resumen());

      expect(facade.motivoFalla()).toBe('EN_DUDA');
    });

    it('motivoFalla: con otro envío del mismo TAG en marcha es YA_SE_ENVIA', async () => {
      sincronizarUC.execute.and.rejectWith(new EnvioFallidoError('x', { yaSeEnvia: true }));
      await facade.sincronizar(resumen());

      expect(facade.motivoFalla()).toBe('YA_SE_ENVIA');
    });

    it('motivoFalla: un Error cualquiera es NO_ENVIADO', async () => {
      sincronizarUC.execute.and.rejectWith(new Error('algo'));
      await facade.sincronizar(resumen());

      expect(facade.motivoFalla()).toBe('NO_ENVIADO');
    });

    it('motivoFalla no se arrastra al intento siguiente', async () => {
      sincronizarUC.execute.and.rejectWith(new EnvioFallidoError('x', { yaSeEnvia: true }));
      await facade.sincronizar(resumen());
      sincronizarUC.execute.and.resolveTo();
      await facade.sincronizar(resumen());

      expect(facade.motivoFalla()).toBe('NO_ENVIADO');
    });

    it('la duda de un intento no se arrastra al siguiente', async () => {
      sincronizarUC.execute.and.rejectWith(new EnvioFallidoError('corte', { enDuda: true }));
      await facade.sincronizar(resumen());
      expect(facade.fallaEnDuda()).toBeTrue();

      sincronizarUC.execute.and.resolveTo();
      await facade.sincronizar(resumen());

      expect(facade.fallaEnDuda()).toBeFalse();
      expect(facade.error()).toBeNull();
    });

    it('un fallo no cambia el estado del TAG en la lista', async () => {
      getConteos.execute.and.resolveTo([resumen()]);
      await facade.load(4, 2);
      sincronizarUC.execute.and.rejectWith(new EnvioFallidoError('corte', { enDuda: true }));

      await facade.sincronizar(resumen());

      expect(facade.conteos()[0].estado).toBe('FINALIZADO');
    });
  });

  /*
   * La pantalla no ofrece Editar/Eliminar en un TAG que el servidor recibió o
   * pudo recibir. La regla de verdad la hacen los casos de uso; esto solo evita
   * mostrar un botón que va a fallar.
   */
  describe('bloqueo por envío', () => {
    it('sin información, ningún TAG está bloqueado', async () => {
      getConteos.execute.and.resolveTo([resumen()]);
      await facade.load(4, 2);

      expect(facade.bloqueo(resumen())).toBeNull();
    });

    it('al cargar, deja bloqueados los TAGs que el servidor tiene o pudo recibir', async () => {
      const c = resumen();
      getConteos.execute.and.resolveTo([c]);
      consultarEnvios.execute.and.resolveTo(new Map([[clavePorTag(c), 'EN_DUDA' as const]]));

      await facade.load(4, 2);

      expect(facade.bloqueo(c)).toBe('EN_DUDA');
      expect(consultarEnvios.execute).toHaveBeenCalledWith([c]);
    });

    it('si un envío falla en duda, el TAG queda bloqueado sin recargar la lista', async () => {
      const c = resumen();
      getConteos.execute.and.resolveTo([c]);
      await facade.load(4, 2);
      expect(facade.bloqueo(c)).toBeNull();

      sincronizarUC.execute.and.rejectWith(new EnvioFallidoError('corte', { enDuda: true }));
      consultarEnvios.execute.and.resolveTo(new Map([[clavePorTag(c), 'EN_DUDA' as const]]));
      await facade.sincronizar(c);

      expect(facade.bloqueo(c)).toBe('EN_DUDA');
    });

    it('reset() suelta los bloqueos', async () => {
      const c = resumen();
      getConteos.execute.and.resolveTo([c]);
      consultarEnvios.execute.and.resolveTo(new Map([[clavePorTag(c), 'ENVIADO' as const]]));
      await facade.load(4, 2);

      facade.reset();

      expect(facade.bloqueo(c)).toBeNull();
    });
  });
});
