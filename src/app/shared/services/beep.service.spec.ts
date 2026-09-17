import { TestBed } from '@angular/core/testing';
import { BeepService } from './beep.service';

/*
 * Web Audio no corre en ChromeHeadless de la misma forma que en un WebView
 * real, así que lo que se prueba acá es el manejo del timer, no el sonido en
 * sí — new AudioContext() puede o no lanzar según el entorno, y eso ya está
 * cubierto por el try/catch de tono().
 */
describe('BeepService', () => {
  let servicio: BeepService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [BeepService] });
    servicio = TestBed.inject(BeepService);
    jasmine.clock().install();
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  /*
   * Con lectura por pistola en ráfaga, varios SKU fuera de muestra pueden
   * escanearse en menos de RETRASO_TRAS_LECTURA_MS (300ms). Sin cancelar el
   * timer anterior, cada llamada agenda su propio tono y suenan superpuestos.
   */
  it('una ráfaga de llamadas dentro de la ventana de espera agenda un solo tono, no uno por llamada', () => {
    const tonoSpy = spyOn<any>(servicio, 'tono');

    servicio.error();
    jasmine.clock().tick(100);
    servicio.error();
    jasmine.clock().tick(100);
    servicio.error();

    jasmine.clock().tick(300);

    expect(tonoSpy).toHaveBeenCalledTimes(1);
  });

  it('dos llamadas separadas por más que la ventana de espera sí suenan dos veces', () => {
    const tonoSpy = spyOn<any>(servicio, 'tono');

    servicio.error();
    jasmine.clock().tick(300);
    servicio.error();
    jasmine.clock().tick(300);

    expect(tonoSpy).toHaveBeenCalledTimes(2);
  });

  /*
   * El operador puede descartar o finalizar el TAG antes de que se cumplan
   * los 300ms de espera — sin cancelar(), ese beep sonaba igual, ya en la
   * pantalla del TAG siguiente.
   */
  it('cancelar() evita que el beep agendado suene', () => {
    const tonoSpy = spyOn<any>(servicio, 'tono');

    servicio.error();
    servicio.cancelar();
    jasmine.clock().tick(300);

    expect(tonoSpy).not.toHaveBeenCalled();
  });

  it('cancelar() sin ningún beep agendado no rompe nada', () => {
    expect(() => servicio.cancelar()).not.toThrow();
  });
});

/*
 * Estos sí ejercitan obtenerContexto() de verdad (sin espiar tono()), con un
 * AudioContext falso — lo que importa es la recuperación ante un contexto
 * cerrado y el manejo del rechazo de resume(), no el sonido en sí.
 */
describe('BeepService — recuperación del AudioContext', () => {
  let servicio: BeepService;
  let contextosCreados: any[];
  let AudioContextOriginal: typeof AudioContext;

  class AudioContextFalso {
    state: AudioContextState = 'running';
    currentTime = 0;
    resume = jasmine.createSpy('resume').and.resolveTo(undefined);
    createOscillator() {
      return { type: '', frequency: { value: 0 }, connect: () => {}, start: () => {}, stop: () => {} } as any;
    }
    createGain() {
      return {
        gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {},
      } as any;
    }
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [BeepService] });
    servicio = TestBed.inject(BeepService);
    contextosCreados = [];
    AudioContextOriginal = (globalThis as any).AudioContext;
    (globalThis as any).AudioContext = function (this: unknown) {
      const ctx = new AudioContextFalso();
      contextosCreados.push(ctx);
      return ctx;
    };
    jasmine.clock().install();
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    (globalThis as any).AudioContext = AudioContextOriginal;
  });

  it('un AudioContext cerrado se descarta y se crea uno nuevo, en vez de fallar para siempre', () => {
    servicio.error();
    jasmine.clock().tick(300);
    expect(contextosCreados.length).toBe(1);

    contextosCreados[0].state = 'closed';

    servicio.error();
    jasmine.clock().tick(300);

    expect(contextosCreados.length).toBe(2);
  });

  it('un resume() rechazado no deja un unhandled rejection sin loguear', async () => {
    spyOn(console, 'error');

    servicio.error();
    jasmine.clock().tick(300);
    const ctx = contextosCreados[0];
    ctx.state = 'suspended';
    ctx.resume.and.rejectWith(new Error('autoplay bloqueado'));

    servicio.error();
    jasmine.clock().tick(300);
    await Promise.resolve();
    await Promise.resolve();

    expect(console.error).toHaveBeenCalledWith(
      '[BeepService] no se pudo reanudar el AudioContext:',
      jasmine.any(Error)
    );
  });
});
