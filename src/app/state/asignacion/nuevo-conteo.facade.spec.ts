import { TestBed } from '@angular/core/testing';
import { NuevoConteoFacade } from './nuevo-conteo.facade';
import { BuscarNuevoConteoUseCase } from '../../application/asignacion/buscar-nuevo-conteo.use-case';
import { Session } from '../../domain/auth/models/session.model';
import { TiendaVigente } from '../../application/sucursal/actualizar-tienda-operador.use-case';

const ASIGNACION = { eventoId: 7, sucursalId: 4, nombre: 'Evento 7', fechaProgramada: '2026-08-18' };
const SIN_TIENDA_VIGENTE: TiendaVigente | null = null;

/*
 * La consulta va contra el endpoint de preparacion, que identifica al operador
 * por correo y rut: por eso la facade recibe la sesion y no solo la tienda.
 */
const SESION: Session = { operadorId: 1, rutNormalizado: '12345678', correo: 'op@sodimac.cl' } as Session;

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

  it('conteo nuevo: devuelve la asignación, no marca sin novedad', async () => {
    buscar.execute.and.resolveTo({ asignacion: ASIGNACION, eventoCoincidenteId: null, tiendaVigente: SIN_TIENDA_VIGENTE });

    expect(await facade.buscar(SESION)).toEqual({ asignacion: ASIGNACION, tiendaVigente: SIN_TIENDA_VIGENTE });
    expect(facade.sinNovedad()).toBeFalse();
    expect(facade.buscando()).toBeFalse();
  });

  /*
   * Que el SGO no tenga nada asignado es un resultado esperable: se distingue
   * de un error para que la pantalla invite a reintentar, no a alarmarse.
   */
  it('marca sin novedad cuando no hay conteo asignado', async () => {
    buscar.execute.and.resolveTo({ asignacion: null, eventoCoincidenteId: null, tiendaVigente: SIN_TIENDA_VIGENTE });

    expect(await facade.buscar(SESION)).toEqual({ asignacion: null, tiendaVigente: SIN_TIENDA_VIGENTE });
    expect(facade.sinNovedad()).toBeTrue();
    expect(facade.error()).toBeNull();
  });

  // El evento coincidente (para un eventual reabrir) ya no le importa a esta facade.
  it('sin novedad aunque haya un evento coincidente', async () => {
    buscar.execute.and.resolveTo({ asignacion: null, eventoCoincidenteId: 12, tiendaVigente: SIN_TIENDA_VIGENTE });

    expect((await facade.buscar(SESION)).asignacion).toBeNull();
    expect(facade.sinNovedad()).toBeTrue();
  });

  /*
   * El caso central de este paso: sin conteo nuevo, pero la tienda cambió
   * igual (reasignación sin jornada todavía armada) — quien llama necesita
   * `tiendaVigente` para poder pararse ahí.
   */
  it('propaga tiendaVigente aunque no haya conteo nuevo', async () => {
    const tiendaVigente: TiendaVigente = { sucursalId: 9, codigoTienda: '4070', nombreTienda: 'Tienda Nueva' };
    buscar.execute.and.resolveTo({ asignacion: null, eventoCoincidenteId: null, tiendaVigente });

    const resultado = await facade.buscar(SESION);

    expect(resultado).toEqual({ asignacion: null, tiendaVigente });
    expect(facade.sinNovedad()).toBeTrue();
  });

  it('captura el error sin propagarlo a la pantalla', async () => {
    buscar.execute.and.rejectWith(new Error('Sin conexión con el SGO'));

    expect((await facade.buscar(SESION)).asignacion).toBeNull();
    expect(facade.error()).toBe('Sin conexión con el SGO');
    expect(facade.buscando()).toBeFalse();
  });

  it('limpia el aviso de sin novedad', async () => {
    buscar.execute.and.resolveTo({ asignacion: null, eventoCoincidenteId: null, tiendaVigente: SIN_TIENDA_VIGENTE });
    await facade.buscar(SESION);

    facade.limpiar();

    expect(facade.sinNovedad()).toBeFalse();
  });

  it('una consulta nueva limpia el sin novedad de la anterior', async () => {
    buscar.execute.and.resolveTo({ asignacion: null, eventoCoincidenteId: null, tiendaVigente: SIN_TIENDA_VIGENTE });
    await facade.buscar(SESION);
    expect(facade.sinNovedad()).toBeTrue();

    buscar.execute.and.resolveTo({ asignacion: ASIGNACION, eventoCoincidenteId: null, tiendaVigente: SIN_TIENDA_VIGENTE });
    await facade.buscar(SESION);

    expect(facade.sinNovedad()).toBeFalse();
  });
});
