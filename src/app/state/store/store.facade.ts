import { Injectable, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { StoreService } from '../../data/store/store.service';
import { Store } from '../../domain/store/models/store.model';

@Injectable({ providedIn: 'root' })
export class StoreFacade {
  private storeService = inject(StoreService);

  private storesSignal = signal<Store[]>([]);
  private selectedStoreSignal = signal<Store | null>(null);
  private loadingSignal = signal(false);
  private errorSignal = signal<string | null>(null);

  readonly stores = this.storesSignal.asReadonly();
  readonly selectedStore = this.selectedStoreSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  readonly hasStores = computed(() => this.storesSignal().length > 0);
  readonly hasMultipleStores = computed(() => this.storesSignal().length > 1);
  readonly noStores = computed(() => this.storesSignal().length === 0 && !this.loadingSignal());
  readonly currentStore = computed(() => {
    if (this.selectedStoreSignal()) {
      return this.selectedStoreSignal();
    }
    return this.storesSignal().length === 1 ? this.storesSignal()[0] : null;
  });

  async loadStores(userId: number): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    this.selectedStoreSignal.set(null);
    this.storesSignal.set([]);

    try {
      const stores = await firstValueFrom(this.storeService.getStoresByUser(userId));
      this.storesSignal.set(stores);
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al cargar tiendas');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  selectStore(store: Store): void {
    this.selectedStoreSignal.set(store);
  }
}
