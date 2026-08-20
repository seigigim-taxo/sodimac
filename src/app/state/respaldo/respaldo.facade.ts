import { Injectable, inject, signal } from '@angular/core';
import { RespaldarBaseUseCase } from '../../application/respaldo/respaldar-base.use-case';
import { RespaldoCreado } from '../../domain/respaldo/models/respaldo-creado.model';
export type { RespaldoCreado };

@Injectable({ providedIn: 'root' })
export class RespaldoFacade {
  private respaldar = inject(RespaldarBaseUseCase);

  private generandoSignal = signal(false);
  readonly generando = this.generandoSignal.asReadonly();

  /*
   * Devuelve el resultado en vez de guardarlo en un signal: el respaldo no es
   * un estado de la app, es una acción puntual cuyo resultado se muestra una
   * vez y se olvida. Null cuando falló; el motivo viaja en `error`.
   */
  private errorSignal = signal<string | null>(null);
  readonly error = this.errorSignal.asReadonly();

  async generar(): Promise<RespaldoCreado | null> {
    // Un segundo toque mientras corre duplicaría el archivo y confundiría al operador.
    if (this.generandoSignal()) return null;

    this.generandoSignal.set(true);
    this.errorSignal.set(null);
    try {
      return await this.respaldar.execute();
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'No se pudo generar el respaldo.');
      return null;
    } finally {
      this.generandoSignal.set(false);
    }
  }
}
