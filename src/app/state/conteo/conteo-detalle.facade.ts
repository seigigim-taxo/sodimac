import { Injectable, inject, signal, computed } from '@angular/core';
import { GetConteoDetalleUseCase } from '../../application/conteo/get-conteo-detalle.use-case';
import { AdjustConteoItemUseCase } from '../../application/conteo/adjust-conteo-item.use-case';
import { DeleteConteoItemUseCase } from '../../application/conteo/delete-conteo-item.use-case';
import { SincronizarConteoUseCase } from '../../application/sincronizacion/sincronizar-conteo.use-case';
import { WriteQueue } from '../../core/utils/write-queue';
import { ConteoItem } from '../../domain/conteo/models/conteo-item.model';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
export type { ConteoItem, ConteoResumen };

@Injectable({ providedIn: 'root' })
export class ConteoDetalleFacade {
  private getDetalle    = inject(GetConteoDetalleUseCase);
  private adjustItem    = inject(AdjustConteoItemUseCase);
  private deleteItem    = inject(DeleteConteoItemUseCase);
  private sincronizarUC = inject(SincronizarConteoUseCase);

  private resumenSignal = signal<ConteoResumen | null>(null);
  private itemsSignal   = signal<ConteoItem[]>([]);
  private loadingSignal = signal(false);
  private errorSignal   = signal<string | null>(null);
  private syncingSignal = signal(false);

  // Serializa las escrituras para no solapar operaciones SQLite
  private writeQueue = new WriteQueue();

  readonly resumen  = this.resumenSignal.asReadonly();
  readonly items    = this.itemsSignal.asReadonly();
  readonly loading  = this.loadingSignal.asReadonly();
  readonly error    = this.errorSignal.asReadonly();
  readonly syncing  = this.syncingSignal.asReadonly();
  readonly editable = computed(() => this.resumenSignal()?.estado === 'FINALIZADO');
  readonly noItems  = computed(() => this.itemsSignal().length === 0 && !this.loadingSignal());

  async load(resumen: ConteoResumen): Promise<void> {
    this.resumenSignal.set(resumen);
    this.itemsSignal.set([]);
    this.errorSignal.set(null);
    this.loadingSignal.set(true);
    try {
      const items = await this.getDetalle.execute(
        resumen.eventoId, resumen.ubicacionId, resumen.operadorId, resumen.pdaId, resumen.estado
      );
      this.itemsSignal.set(items);
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al cargar el detalle');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async adjust(productoId: number, delta: number): Promise<void> {
    const resumen = this.resumenSignal();
    if (!resumen || resumen.estado !== 'FINALIZADO') return;
    await this.writeQueue.enqueue(async () => {
      try {
        const item = await this.adjustItem.execute(
          resumen.eventoId, resumen.ubicacionId, productoId, resumen.operadorId, resumen.pdaId, delta, resumen.estado
        );
        this.itemsSignal.update((prev) => prev.map((i) => i.productoId === productoId ? item : i));
      } catch (err) {
        this.errorSignal.set(err instanceof Error ? err.message : 'Error al ajustar cantidad');
      }
    });
  }

  async delete(productoId: number): Promise<void> {
    const resumen = this.resumenSignal();
    if (!resumen || resumen.estado !== 'FINALIZADO') return;
    await this.writeQueue.enqueue(async () => {
      try {
        await this.deleteItem.execute(
          resumen.eventoId, resumen.ubicacionId, productoId, resumen.operadorId, resumen.pdaId, resumen.estado
        );
        this.itemsSignal.update((prev) => prev.filter((i) => i.productoId !== productoId));
      } catch (err) {
        this.errorSignal.set(err instanceof Error ? err.message : 'Error al eliminar item');
      }
    });
  }

  async sincronizar(): Promise<void> {
    const resumen = this.resumenSignal();
    if (!resumen || resumen.estado !== 'FINALIZADO') return;
    this.errorSignal.set(null);
    this.syncingSignal.set(true);
    try {
      await this.sincronizarUC.execute(resumen);
      // editable() pasa a false automáticamente: la lista de items queda solo lectura.
      this.resumenSignal.set({ ...resumen, estado: 'SINCRONIZADO' });
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al sincronizar conteo');
    } finally {
      this.syncingSignal.set(false);
    }
  }

  reset(): void {
    this.resumenSignal.set(null);
    this.itemsSignal.set([]);
    this.errorSignal.set(null);
  }
}
