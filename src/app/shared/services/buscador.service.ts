import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class BuscadorService {
  private abiertoSignal = signal(false);

  readonly abierto = this.abiertoSignal.asReadonly();

  abrir(): void {
    this.abiertoSignal.set(true);
  }

  cerrar(): void {
    this.abiertoSignal.set(false);
  }
}
