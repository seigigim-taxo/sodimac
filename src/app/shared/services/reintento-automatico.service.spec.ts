import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { ReintentoAutomaticoService } from './reintento-automatico.service';
import { NetworkService } from './network.service';
import { AuthFacade } from '../../state/auth/auth.facade';
import { EnviarPendientesFacade } from '../../state/sincronizacion/enviar-pendientes.facade';
import { ResultadoEnviarPendientes } from '../../application/sincronizacion/enviar-pendientes.use-case';
import { EnviarZonificacionUseCase, ResultadoEnvioZonificacion } from '../../application/zonificacion/enviar-zonificacion.use-case';
import { ESPERAS_TRAS_FALLO_MS, MAX_FALLOS_SEGUIDOS, MIN_ENTRE_INTENTOS_MS } from '../../application/sincronizacion/politica-reintento';

/*
 * Cuándo se reintenta solo, y sobre todo cuándo NO: cada llamada de más enciende
 * la radio de la PDA. Se prueba con un reloj simulado, sin esperar de verdad.
 */
const resultado = (extra: Partial<ResultadoEnviarPendientes> = {}): ResultadoEnviarPendientes => ({
  enviados: 0, conError: 0, total: 0, confirmadosTags: [], reintentables: 0, cortadoPorRed: false, ...extra,
});
const CON_PENDIENTES = resultado({ total: 1, conError: 1, reintentables: 1 });
const zonif = (extra: Partial<ResultadoEnvioZonificacion> = {}): ResultadoEnvioZonificacion => ({
  enviadas: 0, rechazadas: 0, reintentables: 0, cortadoPorRed: false, ...extra,
});

describe('ReintentoAutomaticoService', () => {
  let servicio: ReintentoAutomaticoService;
  let facade: jasmine.SpyObj<EnviarPendientesFacade>;
  let zonificacion: jasmine.SpyObj<EnviarZonificacionUseCase>;
  let conectado: ReturnType<typeof signal<boolean>>;
  let sesion: ReturnType<typeof signal<boolean>>;
  let toastCrear: jasmine.Spy;
  let cambioDeEstado: (isActive: boolean) => void;
  let escuchar: jasmine.Spy;

  const vaciarPromesas = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

  /* Pasa el tiempo y deja correr lo que haya quedado esperando. */
  const avanzar = async (ms: number) => { jasmine.clock().tick(ms); await vaciarPromesas(); };

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-10-08T10:00:00'));

    conectado = signal(true);
    sesion = signal(true);
    facade = jasmine.createSpyObj('EnviarPendientesFacade', ['enviarAutomatico']);
    facade.enviarAutomatico.and.resolveTo(resultado());
    zonificacion = jasmine.createSpyObj('EnviarZonificacionUseCase', ['execute']);
    zonificacion.execute.and.resolveTo(zonif());

    toastCrear = jasmine.createSpy('create').and.resolveTo({ present: () => Promise.resolve() });
    TestBed.configureTestingModule({
      providers: [
        ReintentoAutomaticoService,
        { provide: EnviarPendientesFacade, useValue: facade },
        { provide: EnviarZonificacionUseCase, useValue: zonificacion },
        { provide: NetworkService, useValue: { isOnline: conectado } },
        { provide: AuthFacade, useValue: { isAuthenticated: sesion } },
        { provide: ToastController, useValue: { create: toastCrear } },
      ],
    });
    servicio = TestBed.inject(ReintentoAutomaticoService);
    escuchar = spyOn(servicio as never, 'escucharEstadoDeLaApp').and.callFake(((cb: (isActive: boolean) => void) => {
      cambioDeEstado = cb;
    }) as never);
    servicio.iniciar();
  });

  afterEach(() => jasmine.clock().uninstall());

  describe('cuándo reintenta', () => {
    it('al pedirlo (volvió a la app, entró al Inicio) con sesión, red y la app a la vista', async () => {
      servicio.disparar();
      await vaciarPromesas();

      expect(facade.enviarAutomatico).toHaveBeenCalledTimes(1);
    });

    it('cuando vuelve la red', async () => {
      conectado.set(false);
      TestBed.tick();
      conectado.set(true);
      TestBed.tick();
      await vaciarPromesas();

      expect(facade.enviarAutomatico).toHaveBeenCalledTimes(1);
    });

    it('cuando la app vuelve al primer plano', async () => {
      cambioDeEstado(false);
      cambioDeEstado(true);
      await vaciarPromesas();

      expect(facade.enviarAutomatico).toHaveBeenCalledTimes(1);
    });

    it('estar conectado al arrancar NO es un evento: no dispara nada', async () => {
      TestBed.tick();
      await vaciarPromesas();

      expect(facade.enviarAutomatico).not.toHaveBeenCalled();
    });

    it('sin nada pendiente, no deja ningún temporizador (no hay sondeo)', async () => {
      servicio.disparar();
      await vaciarPromesas();
      facade.enviarAutomatico.calls.reset();

      await avanzar(60 * 60 * 1000);

      expect(facade.enviarAutomatico).not.toHaveBeenCalled();
    });
  });

  describe('cuándo NO reintenta (cuidar la batería)', () => {
    it('sin sesión', async () => {
      sesion.set(false);
      servicio.disparar();
      await vaciarPromesas();

      expect(facade.enviarAutomatico).not.toHaveBeenCalled();
    });

    it('sin red', async () => {
      conectado.set(false);
      servicio.disparar();
      await vaciarPromesas();

      expect(facade.enviarAutomatico).not.toHaveBeenCalled();
    });

    it('con la app en segundo plano', async () => {
      cambioDeEstado(false);
      servicio.disparar();
      await vaciarPromesas();

      expect(facade.enviarAutomatico).not.toHaveBeenCalled();
    });

    it('dos pedidos seguidos hacen un solo intento (mínimo entre intentos)', async () => {
      servicio.disparar();
      await vaciarPromesas();
      servicio.disparar();
      await vaciarPromesas();

      expect(facade.enviarAutomatico).toHaveBeenCalledTimes(1);
    });

    it('pasado el mínimo, vuelve a intentar', async () => {
      servicio.disparar();
      await avanzar(MIN_ENTRE_INTENTOS_MS);
      servicio.disparar();
      await vaciarPromesas();

      expect(facade.enviarAutomatico).toHaveBeenCalledTimes(2);
    });

    it('una señal que parpadea no hace una ráfaga de intentos', async () => {
      for (let i = 0; i < 5; i++) {
        conectado.set(false); TestBed.tick();
        conectado.set(true); TestBed.tick();
        await vaciarPromesas();
      }

      expect(facade.enviarAutomatico).toHaveBeenCalledTimes(1);
    });

    it('no se encima con una tanda que sigue en marcha', async () => {
      let terminar!: (r: ResultadoEnviarPendientes) => void;
      facade.enviarAutomatico.and.returnValue(new Promise((ok) => { terminar = ok; }));

      servicio.disparar();
      await avanzar(MIN_ENTRE_INTENTOS_MS + 1);
      servicio.disparar();
      await vaciarPromesas();
      terminar(resultado());
      await vaciarPromesas();

      expect(facade.enviarAutomatico).toHaveBeenCalledTimes(1);
    });

    it('si el operador ya está enviando desde el menú, no hace nada ni deja temporizador', async () => {
      facade.enviarAutomatico.and.resolveTo(null);

      servicio.disparar();
      await vaciarPromesas();
      await avanzar(60 * 60 * 1000);

      expect(facade.enviarAutomatico).toHaveBeenCalledTimes(1);
    });
  });

  describe('tras un fallo: un solo temporizador, cada vez más espaciado', () => {
    beforeEach(() => facade.enviarAutomatico.and.resolveTo(CON_PENDIENTES));

    it('reintenta a los 30 s, ni antes ni mucho después', async () => {
      servicio.disparar();
      await vaciarPromesas();

      await avanzar(ESPERAS_TRAS_FALLO_MS[0] - 1);
      expect(facade.enviarAutomatico).toHaveBeenCalledTimes(1);

      await avanzar(1);
      expect(facade.enviarAutomatico).toHaveBeenCalledTimes(2);
    });

    it('la espera crece con cada fallo seguido', async () => {
      servicio.disparar();
      await vaciarPromesas();

      for (let n = 1; n < MAX_FALLOS_SEGUIDOS; n++) {
        const espera = ESPERAS_TRAS_FALLO_MS[n - 1];
        const antes = facade.enviarAutomatico.calls.count();

        await avanzar(espera - 1);
        expect(facade.enviarAutomatico.calls.count()).toBe(antes);

        await avanzar(1);
        expect(facade.enviarAutomatico.calls.count()).toBe(antes + 1);
      }
    });

    it('agotada la escala, se detiene y espera un evento', async () => {
      servicio.disparar();
      await vaciarPromesas();
      for (const espera of ESPERAS_TRAS_FALLO_MS) await avanzar(espera);
      const hechos = facade.enviarAutomatico.calls.count();
      expect(hechos).toBe(MAX_FALLOS_SEGUIDOS);

      await avanzar(24 * 60 * 60 * 1000);

      expect(facade.enviarAutomatico.calls.count()).toBe(hechos);
    });

    it('agotada la escala, un evento la retoma', async () => {
      servicio.disparar();
      await vaciarPromesas();
      for (const espera of ESPERAS_TRAS_FALLO_MS) await avanzar(espera);
      const hechos = facade.enviarAutomatico.calls.count();

      await avanzar(MIN_ENTRE_INTENTOS_MS);
      servicio.disparar();
      await vaciarPromesas();

      expect(facade.enviarAutomatico.calls.count()).toBe(hechos + 1);
    });

    it('una red nueva reinicia la escala desde los 30 s', async () => {
      servicio.disparar();
      await vaciarPromesas();
      await avanzar(ESPERAS_TRAS_FALLO_MS[0]); // 2.º intento; la próxima espera sería de 1 min
      await avanzar(MIN_ENTRE_INTENTOS_MS);
      const antes = facade.enviarAutomatico.calls.count();

      conectado.set(false); TestBed.tick();
      conectado.set(true); TestBed.tick();
      await vaciarPromesas();
      expect(facade.enviarAutomatico.calls.count()).toBe(antes + 1);

      await avanzar(ESPERAS_TRAS_FALLO_MS[0]);
      expect(facade.enviarAutomatico.calls.count()).toBe(antes + 2);
    });

    it('si hubo avance (se confirmó algo), la escala vuelve a empezar', async () => {
      servicio.disparar();
      await vaciarPromesas();
      await avanzar(ESPERAS_TRAS_FALLO_MS[0]);
      await avanzar(ESPERAS_TRAS_FALLO_MS[1]);

      facade.enviarAutomatico.and.resolveTo({ ...CON_PENDIENTES, confirmadosTags: ['7001'] });
      await avanzar(ESPERAS_TRAS_FALLO_MS[2]);
      const antes = facade.enviarAutomatico.calls.count();

      await avanzar(ESPERAS_TRAS_FALLO_MS[0]);

      expect(facade.enviarAutomatico.calls.count()).toBe(antes + 1);
    });

    it('al lograr enviar todo, deja de reintentar', async () => {
      servicio.disparar();
      await vaciarPromesas();
      facade.enviarAutomatico.and.resolveTo(resultado({ total: 1, enviados: 1 }));
      await avanzar(ESPERAS_TRAS_FALLO_MS[0]);
      const hechos = facade.enviarAutomatico.calls.count();

      await avanzar(60 * 60 * 1000);

      expect(facade.enviarAutomatico.calls.count()).toBe(hechos);
    });

    it('al pasar a segundo plano, cancela el temporizador', async () => {
      servicio.disparar();
      await vaciarPromesas();

      cambioDeEstado(false);
      await avanzar(60 * 60 * 1000);

      expect(facade.enviarAutomatico).toHaveBeenCalledTimes(1);
    });

    it('si la app pasa a segundo plano mientras envía, no deja temporizador', async () => {
      let terminar!: (r: ResultadoEnviarPendientes) => void;
      facade.enviarAutomatico.and.returnValue(new Promise((ok) => { terminar = ok; }));

      servicio.disparar();
      await vaciarPromesas();
      cambioDeEstado(false);
      terminar(CON_PENDIENTES);
      await vaciarPromesas();
      await avanzar(60 * 60 * 1000);

      expect(facade.enviarAutomatico).toHaveBeenCalledTimes(1);
    });

    it('si la tanda lanza un error, no se cae y sigue la escala', async () => {
      spyOn(console, 'error');
      facade.enviarAutomatico.and.rejectWith(new Error('boom'));

      servicio.disparar();
      await vaciarPromesas();
      await avanzar(ESPERAS_TRAS_FALLO_MS[0]);

      expect(facade.enviarAutomatico).toHaveBeenCalledTimes(2);
    });

    it('al volver a la app, no hay dos temporizadores corriendo', async () => {
      servicio.disparar();
      await vaciarPromesas();
      cambioDeEstado(false);
      await avanzar(MIN_ENTRE_INTENTOS_MS);
      cambioDeEstado(true);
      await vaciarPromesas();
      const antes = facade.enviarAutomatico.calls.count();

      await avanzar(ESPERAS_TRAS_FALLO_MS[1]);

      // Un solo temporizador: un intento más, no dos.
      expect(facade.enviarAutomatico.calls.count()).toBe(antes + 1);
    });
  });

  /*
   * Un temporizador encendido de más es batería gastada: se mira directamente
   * qué se programa y qué se cancela, no solo si al final se llamó o no.
   */
  describe('sin temporizadores de sobra', () => {
    let programar: jasmine.Spy;
    let cancelar: jasmine.Spy;

    /*
     * Se envuelven a mano y se devuelven en este mismo describe: un spyOn se
     * deshace DESPUÉS del afterEach de arriba, que desinstala el reloj simulado,
     * y dejaba el reloj roto para los tests siguientes.
     */
    let originalSet: typeof window.setTimeout;
    let originalClear: typeof window.clearTimeout;

    beforeEach(() => {
      facade.enviarAutomatico.and.resolveTo(CON_PENDIENTES);
      originalSet = window.setTimeout;
      originalClear = window.clearTimeout;
      programar = jasmine.createSpy('setTimeout').and.callFake(((...args: Parameters<typeof window.setTimeout>) => originalSet(...args)) as never);
      cancelar = jasmine.createSpy('clearTimeout').and.callFake(((id?: number) => originalClear(id)) as never);
      window.setTimeout = programar as never;
      window.clearTimeout = cancelar as never;
    });

    afterEach(() => {
      window.setTimeout = originalSet;
      window.clearTimeout = originalClear;
    });

    it('tras un fallo programa exactamente uno', async () => {
      servicio.disparar();
      await vaciarPromesas();

      expect(programar).toHaveBeenCalledTimes(1);
    });

    it('al pasar a segundo plano cancela el que estaba pendiente', async () => {
      servicio.disparar();
      await vaciarPromesas();
      cancelar.calls.reset();

      cambioDeEstado(false);

      expect(cancelar).toHaveBeenCalledTimes(1);
    });

    it('en segundo plano sin nada pendiente, no cancela nada', async () => {
      cambioDeEstado(false);

      expect(cancelar).not.toHaveBeenCalled();
    });

    it('si pasa a segundo plano mientras envía, no programa ninguno', async () => {
      let terminar!: (r: ResultadoEnviarPendientes) => void;
      facade.enviarAutomatico.and.returnValue(new Promise((ok) => { terminar = ok; }));

      servicio.disparar();
      await vaciarPromesas();
      cambioDeEstado(false);
      terminar(CON_PENDIENTES);
      await vaciarPromesas();

      expect(programar).not.toHaveBeenCalled();
    });

    it('varios fallos fuera de tanda programan UN solo temporizador', async () => {
      servicio.programarTrasFallo();
      servicio.programarTrasFallo();
      servicio.programarTrasFallo();

      expect(programar).toHaveBeenCalledTimes(1);
    });

    it('un nuevo intento cancela el temporizador anterior antes de programar el suyo', async () => {
      servicio.disparar();
      await vaciarPromesas();
      await avanzar(MIN_ENTRE_INTENTOS_MS); // el temporizador de 30 s sigue pendiente
      cancelar.calls.reset();

      servicio.disparar();
      await vaciarPromesas();

      expect(cancelar).toHaveBeenCalledTimes(1);
    });
  });

  /*
   * Hallazgo de la prueba en la PDA: un TAG cuyo envío falló al finalizar no se
   * reintentaba solo, porque el temporizador solo lo armaba una tanda automática.
   */
  describe('un envío que falló al finalizar o con el botón (fuera de una tanda)', () => {
    beforeEach(() => facade.enviarAutomatico.and.resolveTo(CON_PENDIENTES));

    it('arma el temporizador: reintenta a los 30 s', async () => {
      servicio.programarTrasFallo();

      await avanzar(ESPERAS_TRAS_FALLO_MS[0] - 1);
      expect(facade.enviarAutomatico).not.toHaveBeenCalled();

      await avanzar(1);
      expect(facade.enviarAutomatico).toHaveBeenCalledTimes(1);
    });

    it('si ya hay un temporizador pendiente, no arma otro', async () => {
      servicio.programarTrasFallo();
      servicio.programarTrasFallo();
      servicio.programarTrasFallo();

      await avanzar(ESPERAS_TRAS_FALLO_MS[0]);

      expect(facade.enviarAutomatico).toHaveBeenCalledTimes(1);
    });

    it('si hay una tanda en marcha, no pisa su cuenta', async () => {
      let terminar!: (r: ResultadoEnviarPendientes) => void;
      facade.enviarAutomatico.and.returnValue(new Promise((ok) => { terminar = ok; }));
      servicio.disparar();
      await vaciarPromesas();

      servicio.programarTrasFallo();
      terminar(resultado());
      await vaciarPromesas();
      await avanzar(60 * 60 * 1000);

      expect(facade.enviarAutomatico).toHaveBeenCalledTimes(1);
    });

    it('con la app en segundo plano no arma nada', async () => {
      cambioDeEstado(false);

      servicio.programarTrasFallo();
      await avanzar(60 * 60 * 1000);

      expect(facade.enviarAutomatico).not.toHaveBeenCalled();
    });

    it('si la escala estaba agotada, un fallo nuevo la vuelve a empezar', async () => {
      servicio.disparar();
      await vaciarPromesas();
      for (const espera of ESPERAS_TRAS_FALLO_MS) await avanzar(espera);
      const hechos = facade.enviarAutomatico.calls.count();
      await avanzar(60 * 60 * 1000);
      expect(facade.enviarAutomatico.calls.count()).toBe(hechos); // agotada

      servicio.programarTrasFallo();
      await avanzar(ESPERAS_TRAS_FALLO_MS[0]);

      expect(facade.enviarAutomatico.calls.count()).toBe(hechos + 1);
    });

    it('antes de iniciar() no hace nada', async () => {
      const otro = TestBed.runInInjectionContext(() => new ReintentoAutomaticoService());

      otro.programarTrasFallo();
      await avanzar(60 * 60 * 1000);

      expect(facade.enviarAutomatico).not.toHaveBeenCalled();
    });
  });

  describe('el aviso al operador', () => {
    it('un TAG confirmado: dice cuál', async () => {
      facade.enviarAutomatico.and.resolveTo(resultado({ confirmadosTags: ['7001'] }));

      servicio.disparar();
      await vaciarPromesas();

      expect(toastCrear).toHaveBeenCalledOnceWith(jasmine.objectContaining({ message: 'TAG 7001 enviado.', color: 'success' }));
    });

    it('varios: dice cuántos', async () => {
      facade.enviarAutomatico.and.resolveTo(resultado({ confirmadosTags: ['7001', '7002', '7003'] }));

      servicio.disparar();
      await vaciarPromesas();

      expect(toastCrear).toHaveBeenCalledOnceWith(jasmine.objectContaining({ message: '3 TAGs enviados.' }));
    });

    it('si no se confirmó nada, no molesta', async () => {
      facade.enviarAutomatico.and.resolveTo(CON_PENDIENTES);

      servicio.disparar();
      await vaciarPromesas();

      expect(toastCrear).not.toHaveBeenCalled();
    });

    it('si el aviso falla, el reintento sigue su curso', async () => {
      spyOn(console, 'error');
      toastCrear.and.rejectWith(new Error('sin pantalla'));
      facade.enviarAutomatico.and.resolveTo(resultado({ confirmadosTags: ['7001'], reintentables: 1 }));

      servicio.disparar();
      await vaciarPromesas();
      await avanzar(ESPERAS_TRAS_FALLO_MS[0]);

      expect(facade.enviarAutomatico).toHaveBeenCalledTimes(2);
    });
  });

  it('iniciar() dos veces no duplica los avisos del sistema', () => {
    servicio.iniciar();

    expect(escuchar).toHaveBeenCalledTimes(1);
  });

  /*
   * La zonificación tiene su propia cola de envío, pero se saca con el mismo
   * motor: mismos disparadores, mismas reglas de ahorro y un único temporizador.
   */
  describe('la cola de zonificación', () => {
    it('sale en la misma tanda que los TAG, cortando al primer fallo de red', async () => {
      servicio.disparar();
      await vaciarPromesas();

      expect(zonificacion.execute).toHaveBeenCalledOnceWith({ cortarAlFalloDeRed: true });
    });

    it('lo pendiente de zonificación arma el temporizador aunque no haya TAG pendientes', async () => {
      zonificacion.execute.and.resolveTo(zonif({ reintentables: 2 }));
      servicio.disparar();
      await vaciarPromesas();
      zonificacion.execute.calls.reset();

      await avanzar(ESPERAS_TRAS_FALLO_MS[0]);

      expect(zonificacion.execute).toHaveBeenCalledTimes(1);
    });

    it('sin nada pendiente de ninguna de las dos colas, no deja temporizador', async () => {
      servicio.disparar();
      await vaciarPromesas();
      zonificacion.execute.calls.reset();

      await avanzar(60 * 60 * 1000);

      expect(zonificacion.execute).not.toHaveBeenCalled();
    });

    it('con el operador enviando TAG desde el menú, la zonificación sale igual', async () => {
      facade.enviarAutomatico.and.resolveTo(null);
      zonificacion.execute.and.resolveTo(zonif({ enviadas: 1 }));

      servicio.disparar();
      await vaciarPromesas();

      expect(zonificacion.execute).toHaveBeenCalledTimes(1);
      expect(toastCrear).toHaveBeenCalledTimes(1);
    });

    it('un error en la zonificación no frena la tanda de los TAG', async () => {
      zonificacion.execute.and.rejectWith(new Error('falló'));
      facade.enviarAutomatico.and.resolveTo(resultado({ confirmadosTags: ['3001'] }));
      spyOn(console, 'error');

      servicio.disparar();
      await vaciarPromesas();

      expect(toastCrear.calls.mostRecent().args[0].message).toBe('TAG 3001 enviado.');
    });

    it('avisa "Zonificación enviada." cuando salió todo lo que había', async () => {
      zonificacion.execute.and.resolveTo(zonif({ enviadas: 3 }));

      servicio.disparar();
      await vaciarPromesas();

      expect(toastCrear.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ message: 'Zonificación enviada.', color: 'success' }));
    });

    it('no avisa si todavía queda algo esperando', async () => {
      zonificacion.execute.and.resolveTo(zonif({ enviadas: 1, reintentables: 1 }));

      servicio.disparar();
      await vaciarPromesas();

      expect(toastCrear).not.toHaveBeenCalled();
    });

    it('lo rechazado no es motivo de reintento', async () => {
      zonificacion.execute.and.resolveTo(zonif({ rechazadas: 2 }));
      servicio.disparar();
      await vaciarPromesas();
      zonificacion.execute.calls.reset();

      await avanzar(60 * 60 * 1000);

      expect(zonificacion.execute).not.toHaveBeenCalled();
    });

    it('un fallo de zonificación y otro de TAG juntos cuentan como UN fallo seguido, no dos', async () => {
      facade.enviarAutomatico.and.resolveTo(CON_PENDIENTES);
      zonificacion.execute.and.resolveTo(zonif({ reintentables: 1 }));
      servicio.disparar();
      await vaciarPromesas();
      zonificacion.execute.calls.reset();

      await avanzar(ESPERAS_TRAS_FALLO_MS[0]);

      // La segunda espera de la escala es la siguiente (1 min), no la tercera.
      zonificacion.execute.calls.reset();
      await avanzar(ESPERAS_TRAS_FALLO_MS[1]);
      expect(zonificacion.execute).toHaveBeenCalledTimes(1);
    });
  });
});
