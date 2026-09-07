import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AlertController, LoadingController } from '@ionic/angular/standalone';
import { ActualizarMuestraService } from './actualizar-muestra.service';
import { ActualizarMuestraUseCase, ResultadoActualizarMuestra } from '../../application/asignacion/actualizar-muestra.use-case';
import { ResultadoJornada } from '../../application/asignacion/evaluar-jornadas.use-case';
import { AuthFacade } from '../../state/auth/auth.facade';
import { EventoFacade } from '../../state/evento/evento.facade';
import { SucursalFacade } from '../../state/sucursal/sucursal.facade';
import { ConteoFacade } from '../../state/conteo/conteo.facade';
import { Session } from '../../domain/auth/models/session.model';
import { Evento } from '../../domain/evento/models/evento.model';
import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';

/*
 * Lo que se prueba acá es QUÉ HACE la app con cada resultado posible de
 * ActualizarMuestraUseCase, no las reglas que producen ese resultado —esas
 * viven en el spec del propio caso de uso. El use case va doblado.
 */
const SESION: Session = { operadorId: 7, rutNormalizado: '12345678', correo: 'op@sodimac.cl' };

const evento = (estado: Evento['estado']): Evento => ({
  id: 30, sucursalId: 1, nombre: 'RADIOS AUTO',
  fechaProgramada: '2026-09-02', fechaEjecucion: null, estado,
  fechaRegistro: '2026-09-02 08:00:00',
});

const asignacion: AsignacionConteo = {
  eventoId: 31, sucursalId: 5, nombre: 'AMPOLLETAS AUTO', fechaProgramada: '2026-09-02',
};

describe('ActualizarMuestraService', () => {
  let servicio: ActualizarMuestraService;
  let ejecutar: jasmine.Spy<(...args: unknown[]) => Promise<ResultadoActualizarMuestra>>;
  let session: jasmine.Spy<() => Session | null>;
  let eventoFacade: jasmine.SpyObj<EventoFacade>;
  let sucursalFacade: jasmine.SpyObj<SucursalFacade>;
  let conteoFacade: jasmine.SpyObj<ConteoFacade>;
  let router: jasmine.SpyObj<Router>;
  let alertCreate: jasmine.Spy;
  let loadingCreate: jasmine.Spy;
  let loadingPresent: jasmine.Spy;
  let loadingDismiss: jasmine.Spy;

  beforeEach(() => {
    ejecutar = jasmine.createSpy('execute').and.resolveTo({ estado: 'SIN_CAMBIOS' });

    session = jasmine.createSpy('session').and.returnValue(SESION);

    eventoFacade = jasmine.createSpyObj('EventoFacade', ['selectedEvent', 'limpiarSeleccion', 'loadEventos']);
    eventoFacade.selectedEvent.and.returnValue(null);
    eventoFacade.limpiarSeleccion.and.resolveTo();
    eventoFacade.loadEventos.and.resolveTo();

    sucursalFacade = jasmine.createSpyObj('SucursalFacade', ['loadSucursales', 'stores', 'selectSucursal']);
    sucursalFacade.loadSucursales.and.resolveTo();
    sucursalFacade.stores.and.returnValue([]);

    conteoFacade = jasmine.createSpyObj('ConteoFacade', ['enCurso', 'reset']);
    conteoFacade.enCurso.and.returnValue(false);

    router = jasmine.createSpyObj('Router', ['navigate']);
    router.navigate.and.resolveTo(true);

    alertCreate = jasmine.createSpy('create').and.resolveTo({ present: () => Promise.resolve() });

    loadingPresent = jasmine.createSpy('present').and.resolveTo();
    loadingDismiss = jasmine.createSpy('dismiss').and.resolveTo(true);
    loadingCreate  = jasmine.createSpy('create').and.resolveTo({ present: loadingPresent, dismiss: loadingDismiss });

    TestBed.configureTestingModule({
      providers: [
        ActualizarMuestraService,
        { provide: ActualizarMuestraUseCase, useValue: { execute: ejecutar } },
        { provide: AuthFacade, useValue: { session } },
        { provide: EventoFacade, useValue: eventoFacade },
        { provide: SucursalFacade, useValue: sucursalFacade },
        { provide: ConteoFacade, useValue: conteoFacade },
        { provide: Router, useValue: router },
        { provide: AlertController, useValue: { create: alertCreate } },
        { provide: LoadingController, useValue: { create: loadingCreate } },
      ],
    });
    servicio = TestBed.inject(ActualizarMuestraService);
  });

  describe('sin sesión', () => {
    it('avisa y no consulta si falta la sesión', async () => {
      session.and.returnValue(null);

      await servicio.actualizar();

      expect(ejecutar).not.toHaveBeenCalled();
      expect(alertCreate).toHaveBeenCalled();
    });

    it('no muestra el loading: no hay nada que esperar', async () => {
      session.and.returnValue(null);

      await servicio.actualizar();

      expect(loadingCreate).not.toHaveBeenCalled();
    });
  });

  /*
   * El botón vive en <ion-menu-toggle>: tocarlo cierra el menú al instante, y
   * con eso se pierde el spinner inline del propio ítem. Sin este loading el
   * operador no tiene ninguna señal de que algo está pasando hasta el aviso
   * final.
   */
  describe('loading de pantalla completa', () => {
    it('se muestra apenas arranca la consulta', async () => {
      await servicio.actualizar();

      expect(loadingCreate).toHaveBeenCalled();
      expect(loadingPresent).toHaveBeenCalled();
    });

    it('se saca antes de mostrar el aviso de resultado', async () => {
      await servicio.actualizar();

      expect(loadingDismiss).toHaveBeenCalled();
      expect(alertCreate).toHaveBeenCalled();
    });

    it('se saca también si el caso de uso lanza', async () => {
      ejecutar.and.rejectWith(new Error('Sin conexión con el servidor.'));

      await servicio.actualizar();

      expect(loadingDismiss).toHaveBeenCalled();
    });
  });

  describe('resultado ACTUALIZADA', () => {
    beforeEach(() => {
      ejecutar.and.resolveTo({ estado: 'ACTUALIZADA', asignacion });
    });

    it('se para en la tienda y los eventos de la asignación nueva', async () => {
      sucursalFacade.stores.and.returnValue([{ id: 5, codigoTienda: '4724', nombre: 'HC BIOBIO' } as never]);

      await servicio.actualizar();

      expect(sucursalFacade.selectSucursal).toHaveBeenCalled();
      expect(eventoFacade.loadEventos).toHaveBeenCalledWith(asignacion.sucursalId);
    });

    it('limpia la sesión de conteo si había una en memoria', async () => {
      conteoFacade.enCurso.and.returnValue(true);

      await servicio.actualizar();

      expect(conteoFacade.reset).toHaveBeenCalled();
    });

    it('no toca la sesión de conteo si no había ninguna', async () => {
      conteoFacade.enCurso.and.returnValue(false);

      await servicio.actualizar();

      expect(conteoFacade.reset).not.toHaveBeenCalled();
    });

    it('navega a Inicio', async () => {
      await servicio.actualizar();

      expect(router.navigate).toHaveBeenCalledWith(['/home']);
    });

    it('avisa con el nombre de la muestra nueva', async () => {
      await servicio.actualizar();

      const [args] = alertCreate.calls.mostRecent().args;
      expect(args.message).toContain('AMPOLLETAS AUTO');
    });
  });

  describe('resultado SIN_CAMBIOS', () => {
    /*
     * Nada cambió y el conteo ya no se cierra a nivel de evento: no hay
     * ninguna razón para refrescar la lista de eventos ni sacar al operador
     * de la pantalla en la que esté.
     */
    it('no navega ni refresca eventos, con o sin evento previo', async () => {
      eventoFacade.selectedEvent.and.returnValue(evento('ABIERTO'));

      await servicio.actualizar();

      expect(eventoFacade.limpiarSeleccion).not.toHaveBeenCalled();
      expect(eventoFacade.loadEventos).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('avisa que ya tiene la maestra vigente', async () => {
      await servicio.actualizar();

      const [args] = alertCreate.calls.mostRecent().args;
      expect(args.header).toBe('Ya tienes la maestra vigente');
    });
  });

  describe('resultado ERROR_BUSQUEDA', () => {
    // No se tocó nada antes de que fallara la búsqueda: no hay nada que refrescar.
    it('no navega ni refresca eventos', async () => {
      eventoFacade.selectedEvent.and.returnValue(evento('ABIERTO'));
      ejecutar.and.resolveTo({ estado: 'ERROR_BUSQUEDA', mensaje: 'No se pudo consultar si hay una maestra nueva.' });

      await servicio.actualizar();

      expect(eventoFacade.limpiarSeleccion).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('avisa con el mensaje que arma el caso de uso', async () => {
      ejecutar.and.resolveTo({ estado: 'ERROR_BUSQUEDA', mensaje: 'No se pudo consultar si hay una maestra nueva.' });

      await servicio.actualizar();

      const [args] = alertCreate.calls.mostRecent().args;
      expect(args.header).toBe('No se pudo actualizar');
      expect(args.message).toBe('No se pudo consultar si hay una maestra nueva.');
    });
  });

  describe('si el caso de uso lanza', () => {
    it('avisa con el mensaje del error y no rompe', async () => {
      ejecutar.and.rejectWith(new Error('Sin conexión con el servidor.'));

      await servicio.actualizar();

      const [args] = alertCreate.calls.mostRecent().args;
      expect(args.message).toBe('Sin conexión con el servidor.');
    });
  });

  describe('resultado VENTANA (sin evento seleccionado)', () => {
    const hoy: ResultadoJornada = { fecha: '2026-09-02', resultado: { tipo: 'SIN_NOVEDAD' } };
    const manianaNueva: ResultadoJornada = {
      fecha: '2026-09-03',
      resultado: { tipo: 'NUEVO', asignacion: { ...asignacion, fechaProgramada: '2026-09-03' } },
    };

    it('avisa con las dos jornadas cuando ninguna tiene novedad', async () => {
      ejecutar.and.resolveTo({ estado: 'VENTANA', resultados: [hoy, { ...manianaNueva, resultado: { tipo: 'SIN_NOVEDAD' } }] });

      await servicio.actualizar();

      const [args] = alertCreate.calls.mostRecent().args;
      expect(args.header).toBe('Ya tienes la maestra vigente');
      expect(args.message).toContain('sin cambios');
    });

    it('avisa "Maestra actualizada" y se para en la jornada con novedad', async () => {
      ejecutar.and.resolveTo({ estado: 'VENTANA', resultados: [hoy, manianaNueva] });
      sucursalFacade.stores.and.returnValue([{ id: 5, codigoTienda: '4724', nombre: 'HC BIOBIO' } as never]);

      await servicio.actualizar();

      const [args] = alertCreate.calls.mostRecent().args;
      expect(args.header).toBe('Maestra actualizada');
      expect(args.message).toContain('AMPOLLETAS AUTO');
      expect(eventoFacade.loadEventos).toHaveBeenCalledWith(asignacion.sucursalId);
    });

    // No se para en ninguna asignación si las dos jornadas están sin novedad.
    it('no se para en ninguna tienda cuando ninguna jornada tiene novedad', async () => {
      ejecutar.and.resolveTo({ estado: 'VENTANA', resultados: [hoy, { ...manianaNueva, resultado: { tipo: 'SIN_NOVEDAD' } }] });

      await servicio.actualizar();

      expect(sucursalFacade.selectSucursal).not.toHaveBeenCalled();
    });

    it('navega a Inicio cuando hay novedad', async () => {
      ejecutar.and.resolveTo({ estado: 'VENTANA', resultados: [manianaNueva] });

      await servicio.actualizar();

      expect(router.navigate).toHaveBeenCalledWith(['/home']);
    });

    // Nada cambió: no hay razón para sacar al operador de donde esté parado.
    it('no navega cuando ninguna jornada tiene novedad', async () => {
      ejecutar.and.resolveTo({ estado: 'VENTANA', resultados: [hoy] });

      await servicio.actualizar();

      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe('reentrancia', () => {
    it('una segunda llamada mientras la primera está en curso no hace nada', async () => {
      let resolver: (r: ResultadoActualizarMuestra) => void = () => {};
      ejecutar.and.returnValue(new Promise((r) => { resolver = r; }));

      const primera = servicio.actualizar();
      await servicio.actualizar();
      resolver({ estado: 'SIN_CAMBIOS' });
      await primera;

      expect(ejecutar).toHaveBeenCalledTimes(1);
    });

    it('actualizando() refleja el estado mientras corre', async () => {
      let resolver: (r: ResultadoActualizarMuestra) => void = () => {};
      ejecutar.and.returnValue(new Promise((r) => { resolver = r; }));

      const promesa = servicio.actualizar();
      expect(servicio.actualizando()).toBeTrue();

      resolver({ estado: 'SIN_CAMBIOS' });
      await promesa;

      expect(servicio.actualizando()).toBeFalse();
    });
  });
});
