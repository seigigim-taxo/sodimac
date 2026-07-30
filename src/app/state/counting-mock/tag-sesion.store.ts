import { Injectable, signal } from '@angular/core';
import { ItemMock, ZonaMock } from './tags-mock.store';

/*
 * MOCK — sesión del TAG en curso, compartida entre la pantalla de TAG+zona
 * (donde se elige) y la pantalla de conteo (donde se usa y se limpia al
 * finalizar). Vive aparte de TagsMockStore porque es efímera por-tag, no
 * data del evento.
 *
 * itemsIniciales solo se usa al reabrir un TAG que quedó "Pendiente": trae
 * los SKUs ya cargados para poder seguir editándolos en la pantalla de
 * conteo, en vez de partir desde cero.
 */
@Injectable({ providedIn: 'root' })
export class TagSesionStore {
  readonly tagActual      = signal<string | null>(null);
  readonly zonaActual     = signal<ZonaMock | null>(null);
  readonly itemsIniciales = signal<ItemMock[]>([]);

  iniciar(tag: string, zona: ZonaMock, itemsIniciales: ItemMock[] = []): void {
    this.tagActual.set(tag);
    this.zonaActual.set(zona);
    this.itemsIniciales.set(itemsIniciales);
  }

  consumirItemsIniciales(): ItemMock[] {
    const items = this.itemsIniciales();
    this.itemsIniciales.set([]);
    return items;
  }

  reset(): void {
    this.tagActual.set(null);
    this.zonaActual.set(null);
    this.itemsIniciales.set([]);
  }
}
