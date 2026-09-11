import { Injectable, signal } from '@angular/core';

/* Igual que BuscadorService: solo abre/cierra el modal. El estado de los
 * números vive en CalculadoraComponent, que no se remonta entre aperturas. */
@Injectable({ providedIn: 'root' })
export class CalculadoraService {
  private abiertoSignal = signal(false);

  readonly abierto = this.abiertoSignal.asReadonly();

  abrir(): void {
    this.abiertoSignal.set(true);
  }

  cerrar(): void {
    this.abiertoSignal.set(false);
  }
}
