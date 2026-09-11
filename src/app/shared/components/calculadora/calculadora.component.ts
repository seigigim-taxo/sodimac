import { Component, computed, signal } from '@angular/core';
import {
  EstadoCalculadora, Operacion,
  estadoInicial, limpiar, presionarDigito, presionarPunto, presionarOperacion, presionarIgual,
} from '../../utils/calculadora.util';

/*
 * Calculadora simple del menú lateral: las 4 operaciones básicas, sin más.
 *
 * Vive fuera del router-outlet (montada una sola vez en AppComponent, como el
 * buscador de SKU), así que el número que estaba tipeando el operador sigue
 * ahí si vuelve a abrirla — no hace falta resetearla al cerrar.
 */
@Component({
  selector: 'app-calculadora',
  templateUrl: './calculadora.component.html',
})
export class CalculadoraComponent {
  private estadoSignal = signal<EstadoCalculadora>(estadoInicial());

  pantalla = computed(() => this.estadoSignal().pantalla);
  hayError = computed(() => this.estadoSignal().error);
  operacionActiva = computed(() => this.estadoSignal().operacionPendiente);

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
