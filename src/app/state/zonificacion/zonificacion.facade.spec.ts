import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AgendasCargadas, CargarAgendasZonificacionUseCase } from '../../application/zonificacion/cargar-agendas-zonificacion.use-case';
import { CargarCatalogoZonificacionUseCase, CatalogoCargado } from '../../application/zonificacion/cargar-catalogo-zonificacion.use-case';
import { CargarEstadoZonificacionUseCase, EstadoCargado } from '../../application/zonificacion/cargar-estado-zonificacion.use-case';
import { ContarPendientesZonificacionUseCase } from '../../application/zonificacion/contar-pendientes-zonificacion.use-case';
import { DescartarRechazadaZonificacionUseCase } from '../../application/zonificacion/descartar-rechazada-zonificacion.use-case';
import { AnularTagUseCase } from '../../application/zonificacion/anular-tag.use-case';
import { ConfirmarZonificacionUseCase } from '../../application/zonificacion/confirmar-zonificacion.use-case';
import { ContextoAgendaZonificacionService } from '../../application/zonificacion/contexto-agenda-zonificacion.service';
import { ListarRechazadasZonificacionUseCase } from '../../application/zonificacion/listar-rechazadas-zonificacion.use-case';
import { ReabrirZonificacionUseCase } from '../../application/zonificacion/reabrir-zonificacion.use-case';
import { EliminarRangoUseCase } from '../../application/zonificacion/eliminar-rango.use-case';
import { EnviarZonificacionUseCase } from '../../application/zonificacion/enviar-zonificacion.use-case';
import { GuardarRangoUseCase } from '../../application/zonificacion/guardar-rango.use-case';
import { ESTADO_V1_DATA } from '../../data/zonificacion/zonificacion.fixtures';
import { parsearRespuestaEstado } from '../../data/zonificacion/zonificacion.parser';
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
  let confirmarUC: jasmine.SpyObj<ConfirmarZonificacionUseCase>;
  let reabrirUC: jasmine.SpyObj<ReabrirZonificacionUseCase>;
  let listarRechazadasUC: jasmine.SpyObj<ListarRechazadasZonificacionUseCase>;
  let envioExecute: jasmine.Spy;

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
    confirmarUC = jasmine.createSpyObj('Confirmar', ['execute']);
    reabrirUC = jasmine.createSpyObj('Reabrir', ['execute']);
    listarRechazadasUC = jasmine.createSpyObj('ListarRechazadas', ['execute']);
    confirmarUC.execute.and.resolveTo({ ok: true });
    reabrirUC.execute.and.resolveTo({ ok: true });
    listarRechazadasUC.execute.and.resolveTo([]);
    descartarUC = jasmine.createSpyObj('Descartar', ['execute', 'descartarTodas']);
    descartarUC.execute.and.resolveTo(true);
    descartarUC.descartarTodas.and.resolveTo(2);
    envioExecute = jasmine.createSpy('execute').and.resolveTo({ enviadas: 1, rechazadas: 0, reintentables: 0, cortadoPorRed: false });
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
        { provide: EnviarZonificacionUseCase, useValue: { cambios, execute: envioExecute } },
        { provide: ConfirmarZonificacionUseCase, useValue: confirmarUC },
        { provide: ReabrirZonificacionUseCase, useValue: reabrirUC },
        { provide: ListarRechazadasZonificacionUseCase, useValue: listarRechazadasUC },
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

  describe('confirmar y reabrir', () => {
    const estadoConUsados = (tagsUsados: number): EstadoCargado => {
      const e = parsearRespuestaEstado(ESTADO_V1_DATA);
      return { estado: { ...e, resumen: { ...e.resumen, tagsUsados } }, vista: aplicarPendientes({ ...e, resumen: { ...e.resumen, tagsUsados } }, []), origen: 'SERVIDOR', fechaDescarga: null, error: null };
    };

    it('confirmar deja el aviso con los rangos y TAG que se veían, y los TAG ya usados que se validarán', async () => {
      estadoUC.execute.and.resolveTo(estadoConUsados(4));
      await facade.abrirAgenda(AGENDA_A);

      const r = await facade.confirmarZonificacion(AGENDA_A);

      expect(r).toEqual({ ok: true });
      expect(confirmarUC.execute).toHaveBeenCalledOnceWith(AGENDA_A);
      expect(facade.mensaje()?.tipo).toBe('ok');
      expect(facade.mensaje()?.texto).toContain('Zonificación confirmada:');
      expect(facade.mensaje()?.texto).toContain('Se validarán los 4 TAG ya utilizados en el conteo.');
    });

    it('si confirmar se rechaza no hay aviso de éxito', async () => {
      await facade.abrirAgenda(AGENDA_A);
      confirmarUC.execute.and.resolveTo({ ok: false, codigo: 'ZONIFICACION_VACIA', data: {} });

      const r = await facade.confirmarZonificacion(AGENDA_A);

      expect(r.ok).toBeFalse();
      expect(facade.mensaje()).toBeNull();
    });

    it('reabrir deja un aviso informativo, distinto si el conteo ya usa TAG', async () => {
      estadoUC.execute.and.resolveTo(estadoConUsados(4));
      await facade.abrirAgenda(AGENDA_A);
      await facade.reabrirZonificacion(AGENDA_A);
      expect(facade.mensaje()).toEqual({ tipo: 'info', texto: jasmine.stringContaining('Zonificación reabierta.') as unknown as string });

      estadoUC.execute.and.resolveTo(estadoConUsados(0));
      await facade.abrirAgenda(AGENDA_A);
      await facade.reabrirZonificacion(AGENDA_A);
      expect(facade.mensaje()).toEqual({ tipo: 'info', texto: 'La zonificación volvió a borrador.' });
    });
  });

  describe('envíos rechazados', () => {
    it('carga la lista de rechazados', async () => {
      const lista = [{ id: 1, idAgenda: 1, numeroAgenda: 'AG-A', titulo: 't', etiqueta: 'Cruce', motivo: 'm', fechaHoraLocal: '2026-10-23 10:00:00' }];
      listarRechazadasUC.execute.and.resolveTo(lista);

      await facade.cargarRechazos();

      expect(facade.rechazos()).toEqual(lista);
    });

    it('descartar uno recarga la lista y vuelve a contar', async () => {
      await facade.descartarRechazo(7);

      expect(descartarUC.execute).toHaveBeenCalledOnceWith(7);
      expect(listarRechazadasUC.execute).toHaveBeenCalled();
      expect(contarUC.execute).toHaveBeenCalled();
    });

    it('descartar todos recarga la lista y vuelve a contar', async () => {
      await facade.descartarTodasLasRechazadas();

      expect(descartarUC.descartarTodas).toHaveBeenCalledTimes(1);
      expect(listarRechazadasUC.execute).toHaveBeenCalled();
      expect(contarUC.execute).toHaveBeenCalled();
    });

    it('al cerrar sesión se suelta la lista', async () => {
      listarRechazadasUC.execute.and.resolveTo([{ id: 1, idAgenda: 1, numeroAgenda: 'x', titulo: 't', etiqueta: 'e', motivo: 'm', fechaHoraLocal: 'f' }]);
      await facade.cargarRechazos();

      facade.reset();

      expect(facade.rechazos()).toEqual([]);
    });
  });

  describe('reintentar ahora', () => {
    it('saca la cola de todas las agendas y vuelve a contar', async () => {
      const r = await facade.reintentarAhora();

      expect(envioExecute).toHaveBeenCalledOnceWith();
      expect(r.enviadas).toBe(1);
      expect(contarUC.execute).toHaveBeenCalled();
    });
  });
});
