import { TestBed } from '@angular/core/testing';
import { AlertaSonidoService } from './alerta-sonido.service';

/*
 * jasmine.createSpy() como constructor de AudioContext falla con "target is
 * not a constructor" — new solo acepta funciones reales. Una función simple
 * que devuelve un contexto falso sí sirve como constructor.
 */
function crearAudioContextFalso() {
  const nodo = () => ({
    connect: jasmine.createSpy('connect'),
    frequency: { value: 0 },
    type: '',
    start: jasmine.createSpy('start'),
    stop: jasmine.createSpy('stop'),
  });
  const ganancia = () => ({
    connect: jasmine.createSpy('connect'),
    gain: {
      setValueAtTime: jasmine.createSpy('setValueAtTime'),
      exponentialRampToValueAtTime: jasmine.createSpy('exponentialRampToValueAtTime'),
    },
  });

  return function AudioContextFalso(this: Record<string, unknown>) {
    this['state'] = 'running';
    this['currentTime'] = 0;
    this['destination'] = {};
    this['createOscillator'] = jasmine.createSpy('createOscillator').and.callFake(nodo);
    this['createGain'] = jasmine.createSpy('createGain').and.callFake(ganancia);
    this['resume'] = jasmine.createSpy('resume').and.resolveTo(undefined);
  } as unknown as typeof AudioContext;
}

describe('AlertaSonidoService', () => {
  let servicio: AlertaSonidoService;
  let audioContextOriginal: typeof AudioContext;

  beforeEach(() => {
    audioContextOriginal = window.AudioContext;
    (window as unknown as { AudioContext: typeof AudioContext }).AudioContext = crearAudioContextFalso();

    TestBed.configureTestingModule({ providers: [AlertaSonidoService] });
    servicio = TestBed.inject(AlertaSonidoService);
  });

  afterEach(() => {
    (window as unknown as { AudioContext: typeof AudioContext }).AudioContext = audioContextOriginal;
  });

  it('no tira si el AudioContext funciona bien', () => {
    expect(() => servicio.sonar()).not.toThrow();
  });

  it('reutiliza el mismo AudioContext entre llamadas', () => {
    spyOn(console, 'error');
    const spyConstructor = spyOn(window, 'AudioContext').and.callThrough();

    servicio.sonar();
    servicio.sonar();

    expect(spyConstructor).toHaveBeenCalledTimes(1);
  });

  it('no bloquea si falla la creación del AudioContext', () => {
    spyOn(console, 'error');
    (window as unknown as { AudioContext: typeof AudioContext }).AudioContext = function () {
      throw new Error('no soportado');
    } as unknown as typeof AudioContext;

    expect(() => servicio.sonar()).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });
});
