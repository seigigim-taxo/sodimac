import { Injectable, inject, signal, computed } from '@angular/core';
import { IniciarSesionConteoUseCase } from '../../application/conteo/iniciar-sesion-conteo.use-case';
import { LoadMuestraSetUseCase, MuestraSet } from '../../application/conteo/load-muestra-set.use-case';
import { UpsertConteoItemUseCase } from '../../application/conteo/upsert-conteo-item.use-case';
import { AdjustConteoItemUseCase } from '../../application/conteo/adjust-conteo-item.use-case';
import { DeleteConteoItemUseCase } from '../../application/conteo/delete-conteo-item.use-case';
import { FinalizarSesionConteoUseCase } from '../../application/conteo/finalizar-sesion-conteo.use-case';
import { WriteQueue } from '../../core/utils/write-queue';
import { ConteoItem } from '../../domain/conteo/models/conteo-item.model';
import { SesionConteo } from '../../domain/conteo/models/sesion-conteo.model';
export type { ConteoItem, SesionConteo };

@Injectable({ providedIn: 'root' })
export class ConteoFacade {
  private iniciarSesion = inject(IniciarSesionConteoUseCase);
  private loadMuestra   = inject(LoadMuestraSetUseCase);
  private upsertItem    = inject(UpsertConteoItemUseCase);
  private adjustItem    = inject(AdjustConteoItemUseCase);
  private deleteItem    = inject(DeleteConteoItemUseCase);
  private finalizarUC   = inject(FinalizarSesionConteoUseCase);

  private sesionSignal     = signal<SesionConteo | null>(null);
  private itemsSignal      = signal<ConteoItem[]>([]);
  private rechazadosSignal = signal<string[]>([]);
  private loadingSignal    = signal(false);
  private errorSignal      = signal<string | null>(null);
  private recoveredSignal  = signal(false);
  private finalizadaSignal = signal(false);
  private muestraSet: MuestraSet = { skuMap: new Map() };

  // Serializa scan/adjust/delete: evita que dos escrituras SQLite
  // se solapen si el operador escanea muy rápido.
  private writeQueue = new WriteQueue();

  readonly sesion     = this.sesionSignal.asReadonly();
  readonly items      = this.itemsSignal.asReadonly();
  readonly rechazados = this.rechazadosSignal.asReadonly();
  readonly loading    = this.loadingSignal.asReadonly();
  readonly error      = this.errorSignal.asReadonly();
  readonly recovered  = this.recoveredSignal.asReadonly();
  readonly totalItems = computed(() => this.itemsSignal().length);
  readonly enCurso    = computed(() => this.sesionSignal() !== null && !this.finalizadaSignal());

  async init(eventoId: number, ubicacionId: number, operadorId: number, pdaId: number): Promise<void> {
    this.reset();
    this.loadingSignal.set(true);
    try {
      const [muestraSet, resultado] = await Promise.all([
        this.loadMuestra.execute(eventoId),
        this.iniciarSesion.execute(eventoId, ubicacionId, operadorId, pdaId),
      ]);
      this.muestraSet = muestraSet;
      this.sesionSignal.set(resultado.sesion);
      this.itemsSignal.set(resultado.items);
      this.recoveredSignal.set(resultado.recovered);
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al iniciar sesión de conteo');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /*
   * 'valido'    → el SKU está en la muestra y quedó persistido
   * 'rechazado' → el SKU no está en la muestra (feedback rojo)
   * 'error'     → el SKU era válido pero la escritura falló (detalle en error())
   */
  async scan(sku: string, cantidad = 1): Promise<'valido' | 'rechazado' | 'error'> {
    const sesion = this.sesionSignal();
    if (!sesion || this.finalizadaSignal()) return 'rechazado';

    const productoId = this.muestraSet.skuMap.get(sku.trim().toUpperCase());

    if (productoId === undefined) {
      // SKU no está en la muestra — feedback rojo, no persiste
      this.rechazadosSignal.update((prev) =>
        prev.includes(sku) ? prev : [sku, ...prev]
      );
      return 'rechazado';
    }

    this.errorSignal.set(null);
    let persistido = false;
    await this.writeQueue.enqueue(async () => {
      try {
        const item = await this.upsertItem.execute(
          sesion.eventoId, sesion.ubicacionId, productoId, sesion.operadorId, sesion.pdaId, cantidad
        );
        this.upsertItemEnMemoria(item);
        persistido = true;
      } catch (err) {
        this.errorSignal.set(err instanceof Error ? err.message : 'Error al registrar scan');
      }
    });
    return persistido ? 'valido' : 'error';
  }

  async adjust(productoId: number, delta: number): Promise<void> {
    const sesion = this.sesionSignal();
    if (!sesion || this.finalizadaSignal()) return;
    await this.writeQueue.enqueue(async () => {
      try {
        const item = await this.adjustItem.execute(
          sesion.eventoId, sesion.ubicacionId, productoId, sesion.operadorId, sesion.pdaId, delta, 'EN_CURSO'
        );
        this.upsertItemEnMemoria(item);
      } catch (err) {
        this.errorSignal.set(err instanceof Error ? err.message : 'Error al ajustar cantidad');
      }
    });
  }

  async delete(productoId: number): Promise<void> {
    const sesion = this.sesionSignal();
    if (!sesion || this.finalizadaSignal()) return;
    await this.writeQueue.enqueue(async () => {
      try {
        await this.deleteItem.execute(
          sesion.eventoId, sesion.ubicacionId, productoId, sesion.operadorId, sesion.pdaId, 'EN_CURSO'
        );
        this.itemsSignal.update((prev) => prev.filter((i) => i.productoId !== productoId));
      } catch (err) {
        this.errorSignal.set(err instanceof Error ? err.message : 'Error al eliminar item');
      }
    });
  }

  async finalizar(): Promise<void> {
    const sesion = this.sesionSignal();
    if (!sesion) return;
    this.loadingSignal.set(true);
    try {
      await this.finalizarUC.execute(
        sesion.eventoId, sesion.ubicacionId, sesion.operadorId, sesion.pdaId
      );
      this.finalizadaSignal.set(true);
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al finalizar sesión');
      throw err;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  reset(): void {
    this.sesionSignal.set(null);
    this.itemsSignal.set([]);
    this.rechazadosSignal.set([]);
    this.errorSignal.set(null);
    this.recoveredSignal.set(false);
    this.finalizadaSignal.set(false);
    this.muestraSet = { skuMap: new Map() };
  }

  // Inserta o actualiza el item en el signal sin recargar toda la lista
  private upsertItemEnMemoria(item: ConteoItem): void {
    this.itemsSignal.update((prev) => {
      const idx = prev.findIndex((i) => i.productoId === item.productoId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = item;
        return next;
      }
      return [item, ...prev];
    });
  }
}
