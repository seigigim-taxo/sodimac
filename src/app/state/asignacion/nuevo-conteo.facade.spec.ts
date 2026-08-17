import { TestBed } from '@angular/core/testing';
import { NuevoConteoFacade } from './nuevo-conteo.facade';
import { BuscarNuevoConteoUseCase } from '../../application/asignacion/buscar-nuevo-conteo.use-case';

const ASIGNACION = { eventoId: 7, nombre: 'Evento 7', fechaProgramada: '2026-08-18' };

describe('NuevoConteoFacade', () => {
  let facade: NuevoConteoFacade;
  let buscar: jasmine.SpyObj<BuscarNuevoConteoUseCase>;

  beforeEach(() => {
    buscar = jasmine.createSpyObj('BuscarNuevoConteoUseCase', ['execute']);

    TestBed.configureTestingModule({
      providers: [
        NuevoConteoFacade,
        { provide: BuscarNuevoConteoUseCase, useValue: buscar },
      ],
    });
    facade = TestBed.inject(NuevoConteoFacade);
  });

  it('devuelve la asignación y no marca sin novedad', async () => {
    buscar.execute.and.resolveTo(ASIGNACION);

    expect(await facade.buscar(1, 5)).toEqual(ASIGNACION);
    expect(facade.sinNovedad()).toBeFalse();
    expect(facade.buscando()).toBeFalse();
  });

  /*
   * Que el SGO no tenga nada asignado es un resultado esperable: se distingue
   * de un error para que la pantalla invite a reintentar, no a alarmarse.
   */
  it('marca sin novedad cuando no hay conteo asignado', async () => {
    buscar.execute.and.resolveTo(null);

    expect(await facade.buscar(1, 5)).toBeNull();
    expect(facade.sinNovedad()).toBeTrue();
    expect(facade.error()).toBeNull();
  });

  it('captura el error sin propagarlo a la pantalla', async () => {
    buscar.execute.and.rejectWith(new Error('Sin conexión con el SGO'));

    expect(await facade.buscar(1, 5)).toBeNull();
    expect(facade.error()).toBe('Sin conexión con el SGO');
    expect(facade.buscando()).toBeFalse();
  });

  it('limpia el aviso de sin novedad', async () => {
    buscar.execute.and.resolveTo(null);
    await facade.buscar(1, 5);

    facade.limpiar();

    expect(facade.sinNovedad()).toBeFalse();
  });
});
