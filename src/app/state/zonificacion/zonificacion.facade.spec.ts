import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AgendasCargadas, CargarAgendasZonificacionUseCase } from '../../application/zonificacion/cargar-agendas-zonificacion.use-case';
import { CargarCatalogoZonificacionUseCase, CatalogoCargado } from '../../application/zonificacion/cargar-catalogo-zonificacion.use-case';
import { CargarEstadoZonificacionUseCase, EstadoCargado } from '../../application/zonificacion/cargar-estado-zonificacion.use-case';
import { ContarPendientesZonificacionUseCase } from '../../application/zonificacion/contar-pendientes-zonificacion.use-case';
import { DescartarRechazadaZonificacionUseCase } from '../../application/zonificacion/descartar-rechazada-zonificacion.use-case';
import { AnularTagUseCase } from '../../application/zonificacion/anular-tag.use-case';
import { ContextoAgendaZonificacionService } from '../../application/zonificacion/contexto-agenda-zonificacion.service';
import { EliminarRangoUseCase } from '../../application/zonificacion/eliminar-rango.use-case';
import { EnviarZonificacionUseCase } from '../../application/zonificacion/enviar-zonificacion.use-case';
import { GuardarRangoUseCase } from '../../application/zonificacion/guardar-rango.use-case';
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
  let guardarUC: jasmine.SpyObj<GuardarRangoUseCase>;
  let eliminarUC: jasmine.SpyObj<EliminarRangoUseCase>;
  let anularUC: jasmine.SpyObj<AnularTagUseCase>;
  let contexto: jasmine.SpyObj<ContextoAgendaZonificacionService>;
  let cambios: ReturnType<typeof signal<number>>;

  const agendas: AgendasCargadas = { lista: { hoy: '2026-10-23', agendas: [] }, origen: 'SERVIDOR', fechaDescarga: null, error: null };
  const catalogo: CatalogoCargado = { catalogo: null, origen: 'NINGUNO', fechaDescarga: null };

  beforeEach(() => {
    agendasUC = jasmine.createSpyObj('Agendas', ['execute']);
    catalogoUC = jasmine.createSpyObj('Catalogo', ['execute']);
    estadoUC = jasmine.createSpyObj('Estado', ['execute']);
    descartarUC = jasmine.createSpyObj('Descartar', ['execute']);
    contarUC = jasmine.createSpyObj('Contar', ['execute']);
    guardarUC = jasmine.createSpyObj('Guardar', ['execute']);
    eliminarUC = jasmine.createSpyObj('Eliminar', ['execute']);
    anularUC = jasmine.createSpyObj('Anular', ['execute']);
    contexto = jasmine.createSpyObj('Contexto', ['cargar']);
    cambios = signal(0);
    guardarUC.execute.and.resolveTo({ ok: true });
    eliminarUC.execute.and.resolveTo({ ok: true });
    anularUC.execute.and.resolveTo({ ok: true });
    contexto.cargar.and.resolveTo({ estado: null, vista: aplicarPendientes(null, []) });
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
        { provide: GuardarRangoUseCase, useValue: guardarUC },
        { provide: EliminarRangoUseCase, useValue: eliminarUC },
        { provide: AnularTagUseCase, useValue: anularUC },
        { provide: ContextoAgendaZonificacionService, useValue: contexto },
        { provide: EnviarZonificacionUseCase, useValue: { cambios } },
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
  describe('acciones del operador', () => {
    const entrada = { agenda: AGENDA_A, idRango: null, codigoZona: 'ALTILLO', tagDesde: 1135, tagHasta: 1140, referenciaUbicacion: null };

    beforeEach(async () => {
      await facade.abrirAgenda(AGENDA_A);
      contexto.cargar.calls.reset();
    });

    it('guardar un rango deja el mensaje, relee lo local y vuelve a contar', async () => {
      const r = await facade.guardarRango(entrada);

      expect(r).toEqual({ ok: true });
      expect(guardarUC.execute).toHaveBeenCalledOnceWith(entrada);
      expect(facade.mensaje()).toEqual({ tipo: 'ok', texto: 'Rango guardado.' });
      expect(contexto.cargar).toHaveBeenCalledOnceWith(AGENDA_A.idAgenda);
      expect(contarUC.execute).toHaveBeenCalled();
    });

    it('si la acción se rechaza no hay mensaje de éxito ni se relee nada', async () => {
      guardarUC.execute.and.resolveTo({ ok: false, codigo: 'RANGO_CRUZADO', data: {} });

      const r = await facade.guardarRango(entrada);

      expect(r.ok).toBeFalse();
      expect(facade.mensaje()).toBeNull();
      expect(contexto.cargar).not.toHaveBeenCalled();
    });

    it('eliminar y anular dejan su propio mensaje', async () => {
      await facade.eliminarRango(AGENDA_A, 758);
      expect(facade.mensaje()?.texto).toContain('Rango eliminado.');
      expect(eliminarUC.execute).toHaveBeenCalledOnceWith(AGENDA_A, 758);

      await facade.anularTag(AGENDA_A, 1133, 'No se encontró en la tienda');
      expect(facade.mensaje()).toEqual({ tipo: 'ok', texto: 'TAG anulado.' });
      expect(anularUC.execute).toHaveBeenCalledOnceWith(AGENDA_A, 1133, 'No se encontró en la tienda');
    });

    it('el mensaje se lee una sola vez', async () => {
      await facade.guardarRango(entrada);

      expect(facade.consumirMensaje()?.texto).toBe('Rango guardado.');
      expect(facade.consumirMensaje()).toBeNull();
      expect(facade.mensaje()).toBeNull();
    });

    it('releer lo local conserva de dónde venía lo que se muestra (servidor o copia)', async () => {
      estadoUC.execute.and.resolveTo({ ...estadoCargado(), origen: 'COPIA', fechaDescarga: '2026-10-23 08:00:00' });
      await facade.refrescarEstado();

      await facade.refrescarVistaLocal();

      expect(facade.estado()?.origen).toBe('COPIA');
      expect(facade.estado()?.fechaDescarga).toBe('2026-10-23 08:00:00');
    });

    it('releer lo local sin agenda abierta no hace nada', async () => {
      facade.reset();
      contexto.cargar.calls.reset();
      await facade.refrescarVistaLocal();
      expect(contexto.cargar).not.toHaveBeenCalled();
    });

    it('cuando el envío en segundo plano termina algo, la vista se relee sola', async () => {
      cambios.set(1);
      TestBed.tick();
      await Promise.resolve();

      expect(contexto.cargar).toHaveBeenCalledWith(AGENDA_A.idAgenda);
      expect(contarUC.execute).toHaveBeenCalled();
    });

    it('al cerrar sesión también se suelta el mensaje', async () => {
      await facade.guardarRango(entrada);
      facade.reset();
      expect(facade.mensaje()).toBeNull();
    });
  });
});
