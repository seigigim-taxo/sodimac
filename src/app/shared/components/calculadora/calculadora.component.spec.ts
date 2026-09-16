import { TestBed } from '@angular/core/testing';
import { CalculadoraComponent } from './calculadora.component';

/*
 * calculadora.util.spec.ts prueba el motor puro (estado.pantalla), pero el
 * texto que realmente ve el operador lo arma el computed `pantalla` de este
 * componente, combinando acumulado/operacionPendiente/pantalla según 3 casos.
 * Esa lógica de armado no queda cubierta por los tests del motor.
 */
describe('CalculadoraComponent — pantalla compuesta', () => {
  let componente: CalculadoraComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CalculadoraComponent] });
    componente = TestBed.createComponent(CalculadoraComponent).componentInstance;
  });

  it('sin operación pendiente, muestra solo el número que se está tipeando', () => {
    componente.digito('1');
    componente.digito('2');
    expect(componente.pantalla()).toBe('12');
  });

  it('operador recién elegido, sin segundo número: "12 +", no repite el primer número', () => {
    componente.digito('1');
    componente.digito('2');
    componente.operacion('+');
    expect(componente.pantalla()).toBe('12 +');
  });

  it('segundo número en curso: "12 + 12"', () => {
    componente.digito('1');
    componente.digito('2');
    componente.operacion('+');
    componente.digito('1');
    componente.digito('2');
    expect(componente.pantalla()).toBe('12 + 12');
  });

  it('el resultado tras "=" se muestra solo, sin operador', () => {
    componente.digito('1');
    componente.digito('2');
    componente.operacion('+');
    componente.digito('3');
    componente.igual();
    expect(componente.pantalla()).toBe('15');
  });

  /*
   * acumulado se interpola con formatear(), no crudo: sin esto, un acumulado
   * como 1e22 se mostraba "1e+22 +" en vez del decimal completo.
   */
  it('un acumulado con resultado muy grande no se muestra en notación científica al elegir el siguiente operador', () => {
    const doce = ['1', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0'];
    for (const d of doce) componente.digito(d);
    componente.operacion('×');
    for (const d of doce) componente.digito(d);
    componente.igual();
    componente.operacion('+');

    expect(componente.pantalla()).toBe('1' + '0'.repeat(22) + ' +');
  });
});
