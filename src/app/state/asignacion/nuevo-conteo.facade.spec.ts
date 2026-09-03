import { TestBed } from '@angular/core/testing';
import { NuevoConteoFacade } from './nuevo-conteo.facade';
import { BuscarOReabrirConteoUseCase } from '../../application/asignacion/buscar-o-reabrir-conteo.use-case';
import { Session } from '../../domain/auth/models/session.model';

const ASIGNACION = { eventoId: 7, sucursalId: 4, nombre: 'Evento 7', fechaProgramada: '2026-08-18' };

/*
 * La consulta va contra el endpoint de preparacion, que identifica al operador
 * por correo y rut: por eso la facade recibe la sesion y no solo la tienda.
 */
const SESION: Session = { operadorId: 1, rutNormalizado: '12345678', correo: 'op@sodimac.cl' } as Session;

describe('NuevoConteoFacade', () => {
  let facade: NuevoConteoFacade;
  let buscar: jasmine.SpyObj<BuscarOReabrirConteoUseCase>;

  beforeEach(() => {
    buscar = jasmine.createSpyObj('BuscarOReabrirConteoUseCase', ['execute']);

    TestBed.configureTestingModule({
      providers: [
        NuevoConteoFacade,
        { provide: BuscarOReabrirConteoUseCase, useValue: buscar },
      ],
    });
    facade = TestBed.inject(NuevoConteoFacade);
  });

  it('conteo nuevo: devuelve la asignación, no marca sin novedad ni reabierto', async () => {
    buscar.execute.and.resolveTo({ tipo: 'NUEVO', asignacion: ASIGNACION });

    expect(await facade.buscar(SESION)).toEqual(ASIGNACION);
    expect(facade.sinNovedad()).toBeFalse();
    expect(facade.reabierto()).toBeFalse();
    expect(facade.buscando()).toBeFalse();
  });

  it('reabierto: devuelve la asignación y marca reabierto', async () => {
    buscar.execute.and.resolveTo({ tipo: 'REABIERTO', asignacion: ASIGNACION });

    expect(await facade.buscar(SESION)).toEqual(ASIGNACION);
    expect(facade.reabierto()).toBeTrue();
    expect(facade.sinNovedad()).toBeFalse();
  });

  /*
   * Que el SGO no tenga nada asignado es un resultado esperable: se distingue
   * de un error para que la pantalla invite a reintentar, no a alarmarse.
   */
  it('marca sin novedad cuando no hay conteo asignado', async () => {
    buscar.execute.and.resolveTo({ tipo: 'SIN_NOVEDAD' });

    expect(await facade.buscar(SESION)).toBeNull();
    expect(facade.sinNovedad()).toBeTrue();
    expect(facade.reabierto()).toBeFalse();
    expect(facade.error()).toBeNull();
  });

  it('captura el error sin propagarlo a la pantalla', async () => {
    buscar.execute.and.rejectWith(new Error('Sin conexión con el SGO'));

    expect(await facade.buscar(SESION)).toBeNull();
    expect(facade.error()).toBe('Sin conexión con el SGO');
    expect(facade.buscando()).toBeFalse();
  });

  it('limpia el aviso de sin novedad y de reabierto', async () => {
    buscar.execute.and.resolveTo({ tipo: 'REABIERTO', asignacion: ASIGNACION });
    await facade.buscar(SESION);

    facade.limpiar();

    expect(facade.sinNovedad()).toBeFalse();
    expect(facade.reabierto()).toBeFalse();
  });

  it('una consulta nueva limpia el reabierto de la anterior', async () => {
    buscar.execute.and.resolveTo({ tipo: 'REABIERTO', asignacion: ASIGNACION });
    await facade.buscar(SESION);
    expect(facade.reabierto()).toBeTrue();

    buscar.execute.and.resolveTo({ tipo: 'NUEVO', asignacion: ASIGNACION });
    await facade.buscar(SESION);

    expect(facade.reabierto()).toBeFalse();
  });
});
