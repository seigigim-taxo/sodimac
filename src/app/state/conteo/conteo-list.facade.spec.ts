import { TestBed } from '@angular/core/testing';
import { ConteoListFacade } from './conteo-list.facade';
import { GetConteosUseCase } from '../../application/conteo/get-conteos.use-case';
import { GetRondaActivaUseCase } from '../../application/conteo/get-ronda-activa.use-case';
import { DeleteConteoSesionUseCase } from '../../application/conteo/delete-conteo-sesion.use-case';
import { SincronizarConteoUseCase } from '../../application/sincronizacion/sincronizar-conteo.use-case';
import { GetTagsReconteoUseCase } from '../../application/conteo/get-tags-reconteo.use-case';
import { ReabrirTagUseCase } from '../../application/conteo/reabrir-tag.use-case';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
import { EstadoConteo } from '../../domain/conteo/models/estado-conteo.model';

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

  beforeEach(() => {
    getConteos   = jasmine.createSpyObj('GetConteosUseCase', ['execute']);
    deleteSesion = jasmine.createSpyObj('DeleteConteoSesionUseCase', ['execute']);
    reabrirTag   = jasmine.createSpyObj('ReabrirTagUseCase', ['execute']);
    deleteSesion.execute.and.resolveTo();
    reabrirTag.execute.and.resolveTo();

    TestBed.configureTestingModule({
      providers: [
        ConteoListFacade,
        { provide: GetConteosUseCase, useValue: getConteos },
        { provide: DeleteConteoSesionUseCase, useValue: deleteSesion },
        { provide: ReabrirTagUseCase, useValue: reabrirTag },
        { provide: GetRondaActivaUseCase, useValue: jasmine.createSpyObj('GetRondaActivaUseCase', ['execute']) },
        { provide: SincronizarConteoUseCase, useValue: jasmine.createSpyObj('SincronizarConteoUseCase', ['execute']) },
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
});
