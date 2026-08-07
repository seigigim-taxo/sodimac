import { Injectable, inject, signal } from '@angular/core';
import { SincronizarConteoConSgoUseCase } from '../../application/sgo/sincronizar-conteo-con-sgo.use-case';
import { ObtenerAnalisisReconteoUseCase, ResultadoAnalisisSgo } from '../../application/sgo/obtener-analisis-reconteo.use-case';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';

@Injectable({ providedIn: 'root' })
export class SgoFacade {
  private sincronizarUC = inject(SincronizarConteoConSgoUseCase);
  private analisisUC = inject(ObtenerAnalisisReconteoUseCase);

  private sincronizandoSignal = signal(false);
  private errorSignal = signal<string | null>(null);
  private analisisSignal = signal<ResultadoAnalisisSgo | null>(null);

  readonly sincronizando = this.sincronizandoSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly analisis = this.analisisSignal.asReadonly();

  async sincronizarConteo(conteo: ConteoResumen): Promise<boolean> {
    this.sincronizandoSignal.set(true);
    this.errorSignal.set(null);

    try {
      await this.sincronizarUC.execute(conteo);
      return true;
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al sincronizar con el SGO');
      return false;
    } finally {
      this.sincronizandoSignal.set(false);
    }
  }

  async obtenerAnalisisReconteo(eventoId: number, iteracionActual: number): Promise<ResultadoAnalisisSgo | null> {
    this.errorSignal.set(null);

    try {
      const resultado = await this.analisisUC.execute(eventoId, iteracionActual);
      this.analisisSignal.set(resultado);
      return resultado;
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al obtener análisis del SGO');
      this.analisisSignal.set(null);
      return null;
    }
  }
}
