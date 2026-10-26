import { TestBed } from '@angular/core/testing';
import { AgendasCargadas, CargarAgendasZonificacionUseCase } from '../../application/zonificacion/cargar-agendas-zonificacion.use-case';
import { CargarCatalogoZonificacionUseCase, CatalogoCargado } from '../../application/zonificacion/cargar-catalogo-zonificacion.use-case';
import { CargarEstadoZonificacionUseCase, EstadoCargado } from '../../application/zonificacion/cargar-estado-zonificacion.use-case';
import { ContarPendientesZonificacionUseCase } from '../../application/zonificacion/contar-pendientes-zonificacion.use-case';
import { DescartarRechazadaZonificacionUseCase } from '../../application/zonificacion/descartar-rechazada-zonificacion.use-case';
import { aplicarPendientes } from '../../domain/zonificacion/utils/vista-con-pendientes.utils';
import { ZonificacionFacade } from './zonificacion.facade';

const AGENDA_A = { idAgenda: 1, numeroAgenda: 'AG-A' };
const AGENDA_B = { idAgenda: 2, numeroAgenda: 'AG-B' };

const estadoCargado = (): EstadoCargado => ({ estado: null, vista: aplicarPendientes(null, []), origen: 'SERVIDOR', fechaDescarga: null, error: null });

describe('ZonificacionFacade', () => {
  let facade: ZonificacionFacade;
  let agendasUC: jasmine.SpyObj<CargarAgendasZonificacionUseCase>;
  let catalogoUC: jasmine.SpyObj<CargarCatalogoZonificacionUseCase>;
  let estadoUC: jasmine.SpyObj<CargarEstadoZonificacionUseCase>;
  let descartarUC: jasmine.SpyObj<DescartarRechazadaZonificacionUseCase>;
  let contarUC: jasmine.SpyObj<ContarPendientesZonificacionUseCase>;

  const agendas: AgendasCargadas = { lista: { hoy: '2026-10-23', agendas: [] }, origen: 'SERVIDOR', fechaDescarga: null, error: null };
  const catalogo: CatalogoCargado = { catalogo: null, origen: 'NINGUNO', fechaDescarga: null };

  beforeEach(() => {
    agendasUC = jasmine.createSpyObj('Agendas', ['execute']);
    catalogoUC = jasmine.createSpyObj('Catalogo', ['execute']);
    estadoUC = jasmine.createSpyObj('Estado', ['execute']);
    descartarUC = jasmine.createSpyObj('Descartar', ['execute']);
    contarUC = jasmine.createSpyObj('Contar', ['execute']);
    agendasUC.execute.and.resolveTo(agendas);
    catalogoUC.execute.and.resolveTo(catalogo);
    estadoUC.execute.and.resolveTo(estadoCargado());
    descartarUC.execute.and.resolveTo(true);
    contarUC.execute.and.resolveTo({ pendientes: 2, rechazadas: 1 });

    TestBed.configureTestingModule({
      providers: [
        { provide: CargarAgendasZonificacionUseCase, useValue: agendasUC },
        { provide: CargarCatalogoZonificacionUseCase, useValue: catalogoUC },
        { provide: CargarEstadoZonificacionUseCase, useValue: estadoUC },
        { provide: DescartarRechazadaZonificacionUseCase, useValue: descartarUC },
        { provide: ContarPendientesZonificacionUseCase, useValue: contarUC },
      ],
    });
    facade = TestBed.inject(ZonificacionFacade);
  });

  it('cargar las agendas trae también el catálogo y marca el tiempo de carga', async () => {
    const pendiente = facade.cargarAgendas();
    expect(facade.cargandoAgendas()).toBeTrue();

    await pendiente;

    expect(facade.cargandoAgendas()).toBeFalse();
    expect(facade.agendas()).toBe(agendas);
    expect(facade.catalogo()).toBe(catalogo);
  });

  it('si la carga falla igual deja de marcar "cargando"', async () => {
    agendasUC.execute.and.rejectWith(new Error('x'));

    await expectAsync(facade.cargarAgendas()).toBeRejected();

    expect(facade.cargandoAgendas()).toBeFalse();
  });

  it('abrir una agenda vacía lo anterior y carga su estado', async () => {
    await facade.abrirAgenda(AGENDA_A);

    expect(facade.agenda()).toEqual(AGENDA_A);
    expect(estadoUC.execute).toHaveBeenCalledOnceWith(AGENDA_A);
    expect(facade.estado()).not.toBeNull();
    expect(facade.cargandoEstado()).toBeFalse();
  });

  it('mientras carga otra agenda no se ve el resumen de la anterior', async () => {
    await facade.abrirAgenda(AGENDA_A);
    let liberar!: (e: EstadoCargado) => void;
    estadoUC.execute.and.returnValue(new Promise<EstadoCargado>((ok) => (liberar = ok)));

    const abriendo = facade.abrirAgenda(AGENDA_B);

    expect(facade.estado()).toBeNull();
    liberar(estadoCargado());
    await abriendo;
    expect(facade.estado()).not.toBeNull();
  });

  it('una respuesta tardía de una agenda que ya se cerró no pisa la actual', async () => {
    let liberarA!: (e: EstadoCargado) => void;
    estadoUC.execute.and.returnValues(new Promise<EstadoCargado>((ok) => (liberarA = ok)), Promise.resolve({ ...estadoCargado(), origen: 'COPIA' }));

    const abriendoA = facade.abrirAgenda(AGENDA_A);
    await facade.abrirAgenda(AGENDA_B);
    liberarA({ ...estadoCargado(), origen: 'SERVIDOR' });
    await abriendoA;

    expect(facade.agenda()).toEqual(AGENDA_B);
    expect(facade.estado()?.origen).toBe('COPIA');
  });

  it('refrescar sin agenda abierta no hace nada', async () => {
    await facade.refrescarEstado();
    expect(estadoUC.execute).not.toHaveBeenCalled();
  });

  it('descartar un rechazo lo quita, refresca la agenda y vuelve a contar', async () => {
    await facade.abrirAgenda(AGENDA_A);
    estadoUC.execute.calls.reset();

    await facade.descartarRechazada(7);

    expect(descartarUC.execute).toHaveBeenCalledOnceWith(7);
    expect(estadoUC.execute).toHaveBeenCalledTimes(1);
    expect(facade.conteo()).toEqual({ pendientes: 2, rechazadas: 1 });
  });

  it('reset suelta todo: quien entra después no ve lo del turno anterior', async () => {
    await facade.cargarAgendas();
    await facade.abrirAgenda(AGENDA_A);
    await facade.contar();

    facade.reset();

    expect(facade.agendas()).toBeNull();
    expect(facade.catalogo()).toBeNull();
    expect(facade.agenda()).toBeNull();
    expect(facade.estado()).toBeNull();
    expect(facade.conteo()).toEqual({ pendientes: 0, rechazadas: 0 });
  });
});
