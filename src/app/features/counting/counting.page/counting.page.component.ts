import { Component, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonMenuButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline, alertCircleOutline, flagOutline, removeOutline, searchOutline, trashOutline,
} from 'ionicons/icons';
import { ScanComponent } from '../../../shared/components/scan/scan.component';
import { EventoFacade } from '../../../state/evento/evento.facade';
import { MUESTRA_MOCK, TagsMockStore } from '../../../state/counting-mock/tags-mock.store';
import { TagSesionStore } from '../../../state/counting-mock/tag-sesion.store';

/*
 * MOCK — pantalla de conteo (SKU + cantidad) del TAG/zona elegidos en la
 * pantalla anterior (TagZonaPageComponent), que vive en TagSesionStore.
 * Sin dominio/aplicación/data todavía: la muestra está simulada aquí mismo.
 */

interface ItemMock { productoId: number; sku: string; descripcion: string; cantidad: number; }

let productoIdSeq = 1;

@Component({
  selector: 'app-counting-page',
  templateUrl: './counting.page.component.html',
  standalone: true,
  imports: [
    ScanComponent,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonMenuButton,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class CountingPageComponent {
  private router          = inject(Router);
  private alertController = inject(AlertController);
  private eventoFacade    = inject(EventoFacade);
  private tagsStore       = inject(TagsMockStore);
  private tagSesion       = inject(TagSesionStore);

  currentEvent = this.eventoFacade.selectedEvent;
  tagActual    = this.tagSesion.tagActual;
  zonaActual   = this.tagSesion.zonaActual;

  items       = signal<ItemMock[]>([]);
  cantidad    = signal(1);
  busquedaSku = signal('');
  lastScan    = signal<{ sku: string; valido: boolean } | null>(null);
  private lastScanTimeoutId: ReturnType<typeof setTimeout> | undefined;

  totalItems      = computed(() => this.items().length);
  finalizando     = signal(false);
  iteracionActual = this.tagsStore.iteracionActual;
  modoActual      = this.tagsStore.modoActual;
  totalFaltantes  = this.tagsStore.totalFaltantes;

  // En reconteo la cantidad no puede superar lo que queda por recontar; en conteo
  // normal no hay techo (null = sin límite).
  cantidadMaxima = computed(() => (this.modoActual() === 'RECONTEO' ? this.totalFaltantes() : null));

  // Se deja entrar el valor excedido al signal a propósito: así el operador ve lo que
  // escribió junto al aviso, en vez de que el campo lo corrija en silencio.
  cantidadExcedida = computed(() => {
    const max = this.cantidadMaxima();
    return max !== null && this.cantidad() > max;
  });

  // Filtra la lista de productos ya escaneados por SKU o descripción — no afecta el conteo, solo la vista.
  itemsFiltrados = computed(() => {
    const q = this.busquedaSku().trim().toUpperCase();
    if (!q) return this.items();
    return this.items().filter((i) => i.sku.includes(q) || i.descripcion.toUpperCase().includes(q));
  });

  constructor() {
    addIcons({ addOutline, alertCircleOutline, flagOutline, removeOutline, searchOutline, trashOutline });

    // Si se venía de reabrir un TAG Pendiente, precarga sus SKUs para seguir editándolos.
    const iniciales = this.tagSesion.consumirItemsIniciales();
    if (iniciales.length > 0) {
      this.items.set(iniciales.map((i) => ({
        productoId:  productoIdSeq++,
        sku:         i.sku,
        descripcion: MUESTRA_MOCK[i.sku] ?? i.sku,
        cantidad:    i.cantidad,
      })));
    }
  }

  onBusquedaInput(event: Event): void {
    const value = (event as CustomEvent<{ value: string | null }>).detail.value ?? '';
    this.busquedaSku.set(value);
  }

  onCantidadInput(event: Event): void {
    const value = Number((event as CustomEvent<{ value: string | null }>).detail.value);
    this.cantidad.set(Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1);
  }

  onScanSku(sku: string): void {
    // Sobre el máximo de reconteo no se registra nada — el aviso ya está en pantalla
    // y la cantidad se mantiene para que el operador la corrija.
    if (this.cantidadExcedida()) return;

    const codigo = sku.trim().toUpperCase();
    const descripcion = MUESTRA_MOCK[codigo];

    // En reconteo, cada TAG tiene sus propios SKUs esperados (no la muestra completa del
    // evento) — un SKU que backoffice espera en OTRO TAG no es válido acá.
    const skusValidos = this.modoActual() === 'RECONTEO'
      ? this.tagsStore.skusEsperadosDeTag(this.tagActual() ?? '')
      : this.tagsStore.muestraSkus();

    if (!descripcion || !skusValidos.includes(codigo)) {
      this.setLastScan({ sku: codigo, valido: false });
      this.cantidad.set(1);
      return;
    }

    this.items.update((prev) => {
      const idx = prev.findIndex((i) => i.sku === codigo);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], cantidad: next[idx].cantidad + this.cantidad() };
        return next;
      }
      return [{ productoId: productoIdSeq++, sku: codigo, descripcion, cantidad: this.cantidad() }, ...prev];
    });
    this.setLastScan({ sku: codigo, valido: true });
    this.cantidad.set(1);
  }

  private setLastScan(scan: { sku: string; valido: boolean }): void {
    clearTimeout(this.lastScanTimeoutId);
    this.lastScan.set(scan);
    this.lastScanTimeoutId = setTimeout(() => this.lastScan.set(null), 3000);
  }

  adjust(productoId: number, delta: number): void {
    this.items.update((prev) => prev.map((i) =>
      i.productoId === productoId ? { ...i, cantidad: Math.max(1, i.cantidad + delta) } : i
    ));
  }

  async delete(productoId: number): Promise<void> {
    const item = this.items().find((i) => i.productoId === productoId);
    if (!item) return;
    const alert = await this.alertController.create({
      header:  'Eliminar producto',
      message: `¿Eliminar ${item.descripcion} (cantidad ${item.cantidad}) del conteo?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => {
          this.items.update((prev) => prev.filter((i) => i.productoId !== productoId));
        } },
      ],
    });
    await alert.present();
  }

  async finalizarTag(): Promise<void> {
    const zona = this.zonaActual();
    const tag  = this.tagActual();
    if (!zona || !tag || this.items().length === 0) return;

    const alert = await this.alertController.create({
      header:  'Finalizar TAG',
      message: `Vas a finalizar el TAG ${tag} con ${this.totalItems()} producto(s). Se intentará sincronizar de inmediato.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Finalizar', role: 'confirm', handler: () => { this.doFinalizarTag(tag, zona.codigo); } },
      ],
    });
    await alert.present();
  }

  private async doFinalizarTag(codigo: string, zonaCodigo: string): Promise<void> {
    this.finalizando.set(true);

    // Espera al resultado real de la sincronización (una sola fuente de verdad, sin timer duplicado).
    await this.tagsStore.agregarPendiente({
      codigo,
      zona:  zonaCodigo,
      items: this.items().map((i) => ({ sku: i.sku, cantidad: i.cantidad })),
    });

    this.tagSesion.reset();

    // En reconteo: si aún quedan TAGs por elegir, vuelve al listado; si no, al resumen.
    if (this.modoActual() === 'RECONTEO' && this.tagsStore.tagsPorRecontarPendientes().length === 0) {
      this.router.navigate(['/tags-resumen']);
    } else {
      this.router.navigate(['/counting-tag']);
    }
  }
}
