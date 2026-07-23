import { Injectable, inject, signal } from '@angular/core';
import { GetMuestraByEventoUseCase } from '../../application/muestra/get-muestra-by-evento.use-case';
import { GetMuestraDetalleByMuestraUseCase } from '../../application/muestra/get-muestra-detalle-by-muestra.use-case';
import { Muestra } from '../../domain/muestra/models/muestra.model';
import { MuestraDetalle } from '../../domain/muestra/models/muestra-detalle.model';
export type { Muestra, MuestraDetalle };

@Injectable({ providedIn: 'root' })
export class MuestraFacade {
  private getMuestraByEvento         = inject(GetMuestraByEventoUseCase);
  private getMuestraDetalleByMuestra = inject(GetMuestraDetalleByMuestraUseCase);

  private sampleSignal   = signal<Muestra | null>(null);
  private detailsSignal  = signal<MuestraDetalle[]>([]);
  private loadingSignal  = signal(false);
  private errorSignal    = signal<string | null>(null);

  readonly sample   = this.sampleSignal.asReadonly();
  readonly details  = this.detailsSignal.asReadonly();
  readonly loading  = this.loadingSignal.asReadonly();
  readonly error    = this.errorSignal.asReadonly();

  async loadMuestra(eventoId: number): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    this.sampleSignal.set(null);
    this.detailsSignal.set([]);
    try {
      const muestra = await this.getMuestraByEvento.execute(eventoId);
      this.sampleSignal.set(muestra);
      if (muestra) {
        const detalle = await this.getMuestraDetalleByMuestra.execute(muestra.id);
        this.detailsSignal.set(detalle);
      }
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al cargar la muestra');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  reset(): void {
    this.sampleSignal.set(null);
    this.detailsSignal.set([]);
    this.errorSignal.set(null);
  }
}
