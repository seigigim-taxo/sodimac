import { TestBed } from '@angular/core/testing';
import { ConnectionQualityService } from './connection-quality.service';

describe('ConnectionQualityService', () => {
  let servicio: ConnectionQualityService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ConnectionQualityService] });
    servicio = TestBed.inject(ConnectionQualityService);
  });

  it('arranca en BUENA sin ninguna muestra', () => {
    expect(servicio.calidad()).toBe('BUENA');
  });

  it('sigue en BUENA con éxitos rápidos', () => {
    servicio.registrarExito(300);
    servicio.registrarExito(450);
    servicio.registrarExito(200);

    expect(servicio.calidad()).toBe('BUENA');
  });

  it('pasa a LENTA cuando el promedio de la ventana supera el umbral', () => {
    servicio.registrarExito(7_000);
    servicio.registrarExito(8_000);
    servicio.registrarExito(6_500);

    expect(servicio.calidad()).toBe('LENTA');
  });

  it('pasa a LENTA con dos fallos consecutivos, sin necesitar tiempos lentos', () => {
    servicio.registrarExito(300);
    servicio.registrarFallo();
    servicio.registrarFallo();

    expect(servicio.calidad()).toBe('LENTA');
  });

  /*
   * No es "modo pegajoso": una muestra rápida que entra a la ventana debe
   * poder sacarla de LENTA de inmediato, sin esperar a que se vacíen los
   * fallos viejos.
   */
  it('vuelve a BUENA apenas una muestra rápida baja el promedio de la ventana', () => {
    servicio.registrarExito(7_000);
    servicio.registrarExito(8_000);
    expect(servicio.calidad()).toBe('LENTA');

    servicio.registrarExito(100);
    servicio.registrarExito(100);
    servicio.registrarExito(100);
    servicio.registrarExito(100);

    expect(servicio.calidad()).toBe('BUENA');
  });

  it('un solo fallo aislado, con éxitos rápidos alrededor, no alcanza para LENTA', () => {
    servicio.registrarExito(300);
    servicio.registrarFallo();
    servicio.registrarExito(300);

    expect(servicio.calidad()).toBe('BUENA');
  });
});
