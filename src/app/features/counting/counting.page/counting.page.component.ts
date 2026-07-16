import { Component, computed, inject, signal } from '@angular/core';
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
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline,
  arrowBackOutline,
  chevronBackOutline,
  chevronForwardOutline,
  removeOutline,
  trashOutline,
} from 'ionicons/icons';
import { ScanComponent } from 'src/app/shared/components/scan/scan.component';
import { ZoneFacade } from 'src/app/state/zone/zone.facade';

interface CountedItem {
  sku: { code: string };
  quantity: number;
}

@Component({
  selector: 'app-counting.page',
  templateUrl: './counting.page.component.html',
  styleUrls: ['./counting.page.component.scss'],
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
export class CountingPageComponent implements ViewWillEnter {
  private router = inject(Router);
  private alertCtrl = inject(AlertController);
  private zoneFacade = inject(ZoneFacade);

  isLoading = signal(false);
  isFinalizing = signal(false);
  quantity = signal(1);
  countedItems = signal<CountedItem[]>([]);
  currentPage = signal(1);
  feedback = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  session = computed(() => {
    const zone = this.zoneFacade.selectedZone();
    return {
      zone: zone?.name ?? null,
      tag: this.zoneFacade.tagValue(),
    };
  });

  totalItems = computed(() => this.countedItems().length);
  totalQuantity = computed(() => this.countedItems().reduce((sum, item) => sum + item.quantity, 0));
  totalPages = computed(() => Math.ceil(this.totalItems() / 5));
  currentPageItems = computed(() => {
    const start = (this.currentPage() - 1) * 5;
    return this.countedItems().slice(start, start + 5);
  });

  constructor() {
    addIcons({
      arrowBackOutline,
      addOutline,
      removeOutline,
      chevronForwardOutline,
      chevronBackOutline,
      trashOutline,
    });
  }

  ionViewWillEnter(): void {
    this.quantity.set(1);
    this.currentPage.set(1);
    this.countedItems.set([]);
    this.feedback.set(null);
  }

  onQuantityInput(event: Event): void {
    const raw = Number((event as CustomEvent).detail.value);
    this.quantity.set(Number.isNaN(raw) || raw < 1 ? 1 : raw);
  }

  onSkuScan(code: string): void {
    // Maqueta: no se procesa el SKU.
    void code;
  }

  adjustQuantity(item: CountedItem, delta: number): void {
    this.countedItems.update((items) =>
      items.map((i) => (i.sku.code === item.sku.code ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i))
    );
  }

  async deleteItem(item: CountedItem): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Eliminar SKU',
      message: `¿Eliminar ${item.sku.code} del conteo?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => {
            this.countedItems.update((items) => items.filter((i) => i.sku.code !== item.sku.code));
          },
        },
      ],
    });
    await alert.present();
  }

  prevPage(): void {
    this.currentPage.update((p) => Math.max(1, p - 1));
  }

  nextPage(): void {
    this.currentPage.update((p) => Math.min(this.totalPages(), p + 1));
  }

  goBack(): void {
    this.router.navigate(['/zone-select']);
  }

  async finalize(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Finalizar conteo',
      message: `Items: ${this.totalItems()}\nTotal unidades: ${this.totalQuantity()}`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Finalizar',
          handler: () => {
            this.isFinalizing.set(false);
          },
        },
      ],
    });
    await alert.present();
  }
}
