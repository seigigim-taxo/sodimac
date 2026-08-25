import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ScanComponent, CodigoCapturado } from './scan.component';
import { DETECCION_CAPTURA_TOKEN, DeteccionCapturaService } from '../../../domain/conteo/services/deteccion-captura.service';
import { MedioCaptura } from '../../../domain/conteo/models/medio-captura.model';

/*
 * La detección va stubeada a propósito: acá se prueba que el componente MIDA y
 * propague, no el criterio para separar pistola de teclado — eso vive en
 * DeteccionCapturaTecladoService y tiene su propio spec. Atar estos tests al
 * ritmo real de ejecución los volvería intermitentes.
 */
class DeteccionStub implements DeteccionCapturaService {
  respuesta: MedioCaptura = 'MANUAL';
  marcasRecibidas: readonly number[] = [];

  clasificar(marcas: readonly number[]): MedioCaptura {
    this.marcasRecibidas = [...marcas];
    return this.respuesta;
  }
}

/*
 * ScanComponent es la única puerta de entrada de códigos de la app: por acá
 * pasan tanto el disparo de la pistola como lo que el operador tipea a mano.
 * Lo que se cubre es la normalización — que ambas vías produzcan el mismo
 * código — y el manejo de foco, que es lo que hace usable la pistola.
 */
describe('ScanComponent', () => {
  let component: ScanComponent;
  let fixture: ComponentFixture<ScanComponent>;
  let deteccion: DeteccionStub;

  function escribir(valor: string): void {
    component.form.get('code')?.setValue(valor);
  }

  function valorActual(): string {
    return component.form.get('code')?.value ?? '';
  }

  beforeEach(async () => {
    deteccion = new DeteccionStub();
    await TestBed.configureTestingModule({
      imports: [ScanComponent],
      providers: [{ provide: DETECCION_CAPTURA_TOKEN, useValue: deteccion }],
    }).compileComponents();
    fixture = TestBed.createComponent(ScanComponent);
    component = fixture.componentInstance;
  });

  describe('normalización mientras se tipea', () => {
    it('pasa a mayúscula lo que se escribe a mano', () => {
      escribir('af001');
      expect(valorActual()).toBe('AF001');
    });

    it('respeta lo que ya viene en mayúscula (la pistola)', () => {
      escribir('AF001');
      expect(valorActual()).toBe('AF001');
    });

    it('normaliza códigos mixtos', () => {
      escribir('aF-00b1x');
      expect(valorActual()).toBe('AF-00B1X');
    });

    it('sigue sacando emojis', () => {
      escribir('af001🔥');
      expect(valorActual()).toBe('AF001');
    });
  });

  describe('confirm', () => {
    it('emite el código normalizado', () => {
      const emitidos: CodigoCapturado[] = [];
      component.scan.subscribe((v) => emitidos.push(v));

      escribir('  af001  ');
      component.confirm();

      expect(emitidos).toEqual([{ codigo: 'AF001', medio: 'MANUAL' }]);
    });

    it('no emite con el campo vacío', () => {
      const emitidos: CodigoCapturado[] = [];
      component.scan.subscribe((v) => emitidos.push(v));

      escribir('');
      component.confirm();

      expect(emitidos).toEqual([]);
    });

    it('no emite mientras está bloqueado', () => {
      fixture.componentRef.setInput('locked', true);
      const emitidos: CodigoCapturado[] = [];
      component.scan.subscribe((v) => emitidos.push(v));

      escribir('AF001');
      component.confirm();

      expect(emitidos).toEqual([]);
    });

    // Modo "por cantidad" del conteo: el código queda a la vista mientras la
    // página pide las unidades, y es ella la que después llama a limpiar().
    it('con cederFoco deja el código en el campo', () => {
      fixture.componentRef.setInput('cederFoco', true);

      escribir('af001');
      component.confirm();

      expect(valorActual()).toBe('AF001');
    });

    it('sin cederFoco limpia el campo para la próxima lectura', () => {
      fixture.componentRef.setInput('scanType', 'sku');

      escribir('af001');
      component.confirm();

      expect(valorActual() ?? '').toBe('');
    });
  });

  describe('medio de captura', () => {
    it('propaga lo que dictamina el servicio de detección', () => {
      deteccion.respuesta = 'ESCANER';
      const emitidos: CodigoCapturado[] = [];
      component.scan.subscribe((v) => emitidos.push(v));

      escribir('AF001');
      component.confirm();

      expect(emitidos).toEqual([{ codigo: 'AF001', medio: 'ESCANER' }]);
    });

    it('mide una marca por cada cambio hecho por el usuario', () => {
      escribir('A');
      escribir('AF');
      escribir('AF0');
      component.confirm();

      expect(deteccion.marcasRecibidas.length).toBe(3);
    });

    /*
     * Las marcas de una lectura no pueden arrastrarse a la siguiente: si lo
     * hicieran, la pausa entre un disparo y el próximo haría que todo pareciera
     * tipeado a mano.
     */
    it('arranca de cero después de confirmar', () => {
      escribir('AF001');
      component.confirm();

      escribir('B');
      escribir('BC');
      component.confirm();

      expect(deteccion.marcasRecibidas.length).toBe(2);
    });

    it('arranca de cero después de limpiar()', () => {
      fixture.componentRef.setInput('cederFoco', true);
      escribir('AF001');
      component.confirm();
      component.limpiar();

      escribir('B');
      component.confirm();

      expect(deteccion.marcasRecibidas.length).toBe(1);
    });

    it('vaciar el campo descarta las marcas acumuladas', () => {
      escribir('AF0');
      escribir('');
      escribir('B');
      component.confirm();

      expect(deteccion.marcasRecibidas.length).toBe(1);
    });
  });

  it('limpiar() deja el campo listo para la próxima lectura', () => {
    fixture.componentRef.setInput('cederFoco', true);

    escribir('af001');
    component.confirm();
    component.limpiar();

    expect(valorActual() ?? '').toBe('');
  });
});
