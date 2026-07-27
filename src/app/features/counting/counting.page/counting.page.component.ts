import { Component, ElementRef, ViewChild, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline, alertCircleOutline, barcodeOutline, checkmarkDoneOutline,
  flagOutline, listOutline, refreshOutline, removeOutline, timeOutline, trashOutline,
} from 'ionicons/icons';
import { ScanComponent } from '../../../shared/components/scan/scan.component';
import { EventoFacade } from '../../../state/evento/evento.facade';
import { MUESTRA_MOCK, TagsMockStore } from '../../../state/counting-mock/tags-mock.store';

/*
 * MOCK — pantalla de trabajo (TAG + zona + conteo) armada con data en
 * memoria para probar la UX del flujo nuevo. Sin dominio/aplicación/data
 * todavía: la muestra y las zonas están simuladas aquí mismo. El estado
 * de los tags (pendiente/enviado) vive en TagsMockStore, compartido con
 * la pantalla de resumen. Se reemplaza por la integración real después.
 */

interface ZonaMock { id: number; codigo: string; nombre: string; }
interface ItemMock { productoId: number; sku: string; descripcion: string; cantidad: number; }

const ZONAS_MOCK: ZonaMock[] = [
  { id: 1, codigo: 'LC01-V01', nombre: 'Venta Principal' },
  { id: 2, codigo: 'LC01-A01', nombre: 'Altillo Norte' },
];

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
    IonItem,
    IonLabel,
    IonList,
    IonMenuButton,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class CountingPageComponent {
  @ViewChild('zonaSelect') zonaSelect!: IonSelect;
  @ViewChild('tagInputEl') tagInputEl!: ElementRef<HTMLIonInputElement>;

  private router          = inject(Router);
  private alertController = inject(AlertController);
  private eventoFacade    = inject(EventoFacade);
  private tagsStore       = inject(TagsMockStore);

  currentEvent = this.eventoFacade.selectedEvent;
  zonas        = ZONAS_MOCK;

  // Tag en curso
  tagInputValue = signal('');
  tagError      = signal<string | null>(null);
  tagActual     = signal<string | null>(null);
  zonaActual    = signal<ZonaMock | null>(null);

  // Conteo del tag en curso
  items    = signal<ItemMock[]>([]);
  cantidad = signal(1);
  lastScan = signal<{ sku: string; valido: boolean } | null>(null);
  private lastScanTimeoutId: ReturnType<typeof setTimeout> | undefined;

  // Panel de tags de hoy — compartido con la pantalla de resumen
  tagsHoy       = this.tagsStore.tags;
  sincronizando = this.tagsStore.sincronizando;

  totalItems = computed(() => this.items().length);

  constructor() {
    addIcons({
      addOutline, alertCircleOutline, barcodeOutline, checkmarkDoneOutline,
      flagOutline, listOutline, refreshOutline, removeOutline, timeOutline, trashOutline,
    });
  }

  goToResumen(): void {
    this.router.navigate(['/tags-resumen']);
  }

  onTagInput(event: Event): void {
    const value = (event as CustomEvent<{ value: string | null }>).detail.value ?? '';
    this.tagInputValue.set(value);
  }

  confirmarTag(): void {
    const value = this.tagInputValue().trim().toUpperCase();
    if (!value) return;

    if (this.tagsStore.yaUsado(value)) {
      this.tagError.set(`El TAG ${value} ya fue usado en este evento`);
      return;
    }

    this.tagError.set(null);
    this.tagActual.set(value);
    this.tagInputValue.set('');

    requestAnimationFrame(() => this.zonaSelect?.open());
  }

  onZonaChange(event: Event): void {
    const zona = (event as CustomEvent<{ value: ZonaMock | null }>).detail.value;
    if (!zona) return;
    this.zonaActual.set(zona);
  }

  onCantidadInput(event: Event): void {
    const value = Number((event as CustomEvent<{ value: string | null }>).detail.value);
    this.cantidad.set(Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1);
  }

  onScanSku(sku: string): void {
    const codigo = sku.trim().toUpperCase();
    const descripcion = MUESTRA_MOCK[codigo];

    if (!descripcion) {
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
        { text: 'Finalizar', role: 'confirm', handler: () => { this.doFinalizarTag(tag, zona); } },
      ],
    });
    await alert.present();
  }

  private doFinalizarTag(codigo: string, zona: ZonaMock): void {
    this.tagsStore.agregarPendiente({
      codigo,
      zona:               zona.codigo,
      cantidadProductos:  this.items().length,
      skus:               this.items().map((i) => i.sku),
    });
    this.resetTagActual();
  }

  private resetTagActual(): void {
    this.tagActual.set(null);
    this.zonaActual.set(null);
    this.items.set([]);
    this.cantidad.set(1);
    this.lastScan.set(null);
    this.tagError.set(null);
    setTimeout(() => this.tagInputEl?.nativeElement?.setFocus?.(), 80);
  }

  reintentar(codigo: string): void {
    this.tagsStore.reintentar(codigo);
  }
}
