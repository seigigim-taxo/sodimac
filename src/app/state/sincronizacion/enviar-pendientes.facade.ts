import { Injectable, inject, signal } from '@angular/core';
import { EnviarPendientesUseCase, ResultadoEnviarPendientes } from '../../application/sincronizacion/enviar-pendientes.use-case';

@Injectable({ providedIn: 'root' })
export class EnviarPendientesFacade {
  private enviarPendientesUC = inject(EnviarPendientesUseCase);

  private enviandoSignal = signal(false);
  private ultimoResultadoSignal = signal<ResultadoEnviarPendientes | null>(null);
  private errorSignal = signal<string | null>(null);

  readonly enviando = this.enviandoSignal.asReadonly();
  readonly ultimoResultado = this.ultimoResultadoSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  async enviar(): Promise<ResultadoEnviarPendientes> {
    this.enviandoSignal.set(true);
    this.errorSignal.set(null);
    try {
      const resultado = await this.enviarPendientesUC.execute();
      this.ultimoResultadoSignal.set(resultado);
      return resultado;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error al enviar pendientes';
      this.errorSignal.set(mensaje);
      throw err;
    } finally {
      this.enviandoSignal.set(false);
    }
  }

  /*
   * La tanda de los reintentos automáticos: corta al primer fallo de red y no
   * toca el error que ve el operador. Devuelve null si ya hay un envío en
   * marcha (el del menú), para no encimarse.
   */
  async enviarAutomatico(): Promise<ResultadoEnviarPendientes | null> {
    if (this.enviandoSignal()) return null;
    this.enviandoSignal.set(true);
    try {
      const resultado = await this.enviarPendientesUC.execute({ cortarAlFalloDeRed: true });
      this.ultimoResultadoSignal.set(resultado);
      return resultado;
    } finally {
      this.enviandoSignal.set(false);
    }
  }

  limpiarResultado(): void {
    this.ultimoResultadoSignal.set(null);
    this.errorSignal.set(null);
  }
}
