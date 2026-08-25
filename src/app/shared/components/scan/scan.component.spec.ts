import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ScanComponent } from './scan.component';

/*
 * ScanComponent es la única puerta de entrada de códigos de la app: por acá
 * pasan tanto el disparo de la pistola como lo que el operador tipea a mano.
 * Lo que se cubre es la normalización — que ambas vías produzcan el mismo
 * código — y el manejo de foco, que es lo que hace usable la pistola.
 */
describe('ScanComponent', () => {
  let component: ScanComponent;
  let fixture: ComponentFixture<ScanComponent>;

  function escribir(valor: string): void {
    component.form.get('code')?.setValue(valor);
  }

  function valorActual(): string {
    return component.form.get('code')?.value ?? '';
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ScanComponent] }).compileComponents();
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
      const emitidos: string[] = [];
      component.scan.subscribe((v) => emitidos.push(v));

      escribir('  af001  ');
      component.confirm();

      expect(emitidos).toEqual(['AF001']);
    });

    it('no emite con el campo vacío', () => {
      const emitidos: string[] = [];
      component.scan.subscribe((v) => emitidos.push(v));

      escribir('');
      component.confirm();

      expect(emitidos).toEqual([]);
    });

    it('no emite mientras está bloqueado', () => {
      fixture.componentRef.setInput('locked', true);
      const emitidos: string[] = [];
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

  it('limpiar() deja el campo listo para la próxima lectura', () => {
    fixture.componentRef.setInput('cederFoco', true);

    escribir('af001');
    component.confirm();
    component.limpiar();

    expect(valorActual() ?? '').toBe('');
  });
});
