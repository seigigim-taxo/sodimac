import { Component, computed, signal } from '@angular/core';
import {
  EstadoCalculadora, Operacion,
  estadoInicial, limpiar, presionarDigito, presionarPunto, presionarOperacion, presionarIgual, formatear,
} from '../../utils/calculadora.util';

/*
 * Calculadora simple del menú lateral: las 4 operaciones básicas, sin más.
 *
 * El modal que la contiene (BotonCalculadoraComponent) usa
 * keepContentsMounted: sin eso, Ionic destruye y recrea este componente en
 * cada cierre/apertura, perdiendo el número en curso. Con eso, el estado
 * sobrevive a cerrar y reabrir — no hace falta resetearlo al cerrar.
 */
@Component({
  selector: 'app-calculadora',
  templateUrl: './calculadora.component.html',
})
export class CalculadoraComponent {
  private estadoSignal = signal<EstadoCalculadora>(estadoInicial());

  hayError = computed(() => this.estadoSignal().error);
  operacionActiva = computed(() => this.estadoSignal().operacionPendiente);

  /*
   * La pantalla muestra la cuenta completa, no solo el último número: al
   * ingresar 12 + 12 tiene que leerse literalmente "12 + 12", no un 12 que
   * desaparece apenas se elige el operador.
   *
   *  - Sin operación pendiente: el número que se está tipeando, o el
   *    resultado (ahí `pantalla` ya trae lo que corresponde mostrar solo).
   *  - Operador recién elegido, todavía sin segundo número: "12 +" — mostrar
   *    `pantalla` acá repetiría el primer número, que ya está en `acumulado`.
   *  - Segundo número en curso: "12 + 12", con lo que se va tipeando.
   */
  pantalla = computed(() => {
    const e = this.estadoSignal();
    if (e.operacionPendiente === null || e.acumulado === null) return e.pantalla;
    /*
     * formatear(), no `${e.acumulado}` crudo: interpolar el number directo
     * usa la conversión implícita de JS (equivalente a String()), que cae en
     * notación científica fuera de [1e-6, 1e21) — el mismo bug que formatear
     * existe para evitar, reexpuesto acá si no se usa también para acumulado.
     */
    const acumuladoTexto = formatear(e.acumulado);
    if (e.esperandoSiguiente) return `${acumuladoTexto} ${e.operacionPendiente}`;
    return `${acumuladoTexto} ${e.operacionPendiente} ${e.pantalla}`;
  });

  digito(d: string): void {
    this.estadoSignal.update((e) => presionarDigito(e, d));
  }

  punto(): void {
    this.estadoSignal.update((e) => presionarPunto(e));
  }

  operacion(op: Operacion): void {
    this.estadoSignal.update((e) => presionarOperacion(e, op));
  }

  igual(): void {
    this.estadoSignal.update((e) => presionarIgual(e));
  }

  limpiar(): void {
    this.estadoSignal.set(limpiar());
  }
}
