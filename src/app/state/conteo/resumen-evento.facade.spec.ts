import { TestBed } from '@angular/core/testing';
import { ResumenEventoFacade } from './resumen-evento.facade';
import { GetResumenEventoUseCase, ResumenEvento } from '../../application/conteo/get-resumen-evento.use-case';
import { GetTrazabilidadEventoUseCase } from '../../application/conteo/get-trazabilidad-evento.use-case';
import { Evento } from '../../domain/evento/models/evento.model';
import { ConteoTrazabilidadItem } from '../../domain/conteo/models/conteo-trazabilidad-item.model';

function evento(id: number): Evento {
  return {
    id, sucursalId: 1, nombre: `Evento ${id}`,
    fechaProgramada: '2026-08-03', fechaEjecucion: null, estado: 'ABIERTO',
    fechaRegistro: '2026-08-03 10:00:00',
  };
}

function resumen(tagsFinalizados: number): ResumenEvento {
  return { totalMuestra: 10, contados: 8, tagsFinalizados, iteracion: 1, qContado: 42 };
}

const TRAZA: ConteoTrazabilidadItem = {
  lecturaId: 1, iteracion: 1, conteoId: 1, tag: '104',
  zonaCodigo: 'SALA_VENTAS', zonaNombre: 'Sala de ventas',
  sku: '1234567', descripcion: 'Taladro',
  stockSistema: 5, cantidadFisica: 4,
  estado: 'FINALIZADO', fechaHora: '2026-08-17 10:00:00',
};

describe('ResumenEventoFacade', () => {
  let facade: ResumenEventoFacade;
  let getResumen: jasmine.SpyObj<GetResumenEventoUseCase>;
  let trazabilidad: jasmine.SpyObj<GetTrazabilidadEventoUseCase>;

  beforeEach(() => {
    getResumen = jasmine.createSpyObj('GetResumenEventoUseCase', ['execute']);
    trazabilidad = jasmine.createSpyObj('GetTrazabilidadEventoUseCase', ['execute']);
    getResumen.execute.and.resolveTo(resumen(3));
    trazabilidad.execute.and.resolveTo([]);

    TestBed.configureTestingModule({
      providers: [
        ResumenEventoFacade,
        { provide: GetResumenEventoUseCase, useValue: getResumen },
        { provide: GetTrazabilidadEventoUseCase, useValue: trazabilidad },
      ],
    });
    facade = TestBed.inject(ResumenEventoFacade);
  });

  it('carga el avance de la ronda activa', async () => {
    await facade.cargarAvance(1, 1, 1);

    expect(facade.avance()).toEqual(resumen(3));
    expect(facade.error()).toBeNull();
  });

  /*
   * El criterio ya no es el estado del evento —el conteo dejó de cerrarse a
   * nivel de evento—, sino si tiene al menos un TAG finalizado.
   */
  it('solo se queda con los eventos que tienen al menos un TAG finalizado', async () => {
    getResumen.execute.and.callFake(async (eventoId: number) =>
      eventoId === 2 ? resumen(0) : resumen(1)
    );

    await facade.cargarConAvance([evento(1), evento(2), evento(3)], 1, 1);

    expect(getResumen.execute).toHaveBeenCalledTimes(3);
    expect(facade.conAvance().map((c) => c.evento.id)).toEqual([1, 3]);
  });

  it('no consulta nada si no hay eventos', async () => {
    await facade.cargarConAvance([], 1, 1);

    expect(getResumen.execute).not.toHaveBeenCalled();
    expect(facade.conAvance()).toEqual([]);
  });

  it('captura el error sin propagarlo, y deja la lista vacía', async () => {
    getResumen.execute.and.rejectWith(new Error('Base local no disponible'));

    await facade.cargarConAvance([evento(1)], 1, 1);

    expect(facade.error()).toBe('Base local no disponible');
    expect(facade.conAvance()).toEqual([]);
  });

  it('carga la trazabilidad del evento', async () => {
    trazabilidad.execute.and.resolveTo([TRAZA]);

    await facade.cargarTrazabilidad(1, 1, 1);

    expect(trazabilidad.execute).toHaveBeenCalledWith(1, 1, 1);
    expect(facade.trazabilidad()).toEqual([TRAZA]);
    expect(facade.trazabilidadLoading()).toBeFalse();
  });

  /*
   * La trazabilidad es una vista de solo lectura: si falla, la pantalla muestra
   * el error con la lista vacía, no la lista anterior — que sería de otro evento.
   */
  it('vacía la trazabilidad si la consulta falla', async () => {
    trazabilidad.execute.and.resolveTo([TRAZA]);
    await facade.cargarTrazabilidad(1, 1, 1);

    trazabilidad.execute.and.rejectWith(new Error('Base local no disponible'));
    await facade.cargarTrazabilidad(2, 1, 1);

    expect(facade.trazabilidad()).toEqual([]);
    expect(facade.error()).toBe('Base local no disponible');
    expect(facade.trazabilidadLoading()).toBeFalse();
  });
});
