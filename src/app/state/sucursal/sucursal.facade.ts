import { Injectable, inject, signal, computed } from '@angular/core';
import { GetSucursalesUseCase } from '../../application/sucursal/get-sucursales.use-case';
import { Sucursal } from '../../domain/sucursal/models/sucursal.model';
export type { Sucursal };

@Injectable({ providedIn: 'root' })
export class SucursalFacade {
  private getSucursales = inject(GetSucursalesUseCase);

  private storesSignal         = signal<Sucursal[]>([]);
  private selectedStoreSignal  = signal<Sucursal | null>(null);
  private loadingSignal        = signal(false);
  private errorSignal          = signal<string | null>(null);

  readonly stores             = this.storesSignal.asReadonly();
  readonly selectedStore      = this.selectedStoreSignal.asReadonly();
  readonly loading            = this.loadingSignal.asReadonly();
  readonly error              = this.errorSignal.asReadonly();
  readonly hasStores          = computed(() => this.storesSignal().length > 0);
  readonly hasMultipleStores  = computed(() => this.storesSignal().length > 1);
  readonly noStores           = computed(() => this.storesSignal().length === 0 && !this.loadingSignal());
  readonly currentStore       = computed(() => {
    const sel = this.selectedStoreSignal();
    if (sel) return sel;
    return this.storesSignal().length === 1 ? this.storesSignal()[0] : null;
  });

  async loadSucursales(userId: number): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    this.storesSignal.set([]);
    try {
      const lista = await this.getSucursales.execute(userId);
      this.storesSignal.set(lista);
      const prev = this.selectedStoreSignal();
      if (prev && !lista.find((s) => s.id === prev.id)) {
        this.selectedStoreSignal.set(null);
      }
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al cargar sucursales');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  selectSucursal(sucursal: Sucursal): void {
    this.selectedStoreSignal.set(sucursal);
  }
}
