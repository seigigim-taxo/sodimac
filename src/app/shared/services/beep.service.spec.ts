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
});
