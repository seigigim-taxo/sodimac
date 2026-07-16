import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonMenuButton, IonSpinner, IonTitle, IonToolbar, ViewWillEnter } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, arrowBackOutline, chevronBackOutline, chevronForwardOutline, removeOutline, trashOutline } from 'ionicons/icons';
import { ScanComponent } from 'src/app/shared/components/scan/scan.component';
import { CountingFacade } from 'src/app/state/counting/counting.facade';
import { CountedItem } from 'src/app/domain/counting/models/counted-item.model';
import { SampleSkuRepository } from '../../../domain/event/repositories/sample-sku.repository';
import { CountingSession } from 'src/app/domain/counting/models/counting-session.model';

@Component({
  selector: 'app-counting.page',
  templateUrl: './counting.page.component.html',
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
  private route = inject(ActivatedRoute);
  private alertCtrl = inject(AlertController);
  private countingFacade = inject(CountingFacade);
  private sampleSkuRepository = inject(SampleSkuRepository);

  sessionId = '';
  session = signal<CountingSession | null>(null);
  isLoading = signal(true);
  isFinalizing = signal(false);

  quantity = signal(1);
  countedItems = signal<CountedItem[]>([]);
  currentPage = signal(1);
  feedback = signal<{ type: 'success' | 'error'; text: string } | null>(null);

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

    effect(() => {
      const total = this.totalPages();
      if (this.currentPage() > total && total > 0) {
        this.currentPage.set(total);
      }
    });
  }

  async ionViewWillEnter(): Promise<void> {
    this.sessionId = this.route.snapshot.paramMap.get('sessionId') ?? '';
    this.quantity.set(1);
    this.currentPage.set(1);

    if (this.sessionId) {
      const session = await this.countingFacade.getById(this.sessionId);
      if (session) {
        this.session.set(session);
        this.countedItems.set([...session.items]);
      }
    }
    this.isLoading.set(false);
  }

  onQuantityInput(event: Event): void {
    const raw = Number((event as CustomEvent).detail.value);
    this.quantity.set(Number.isNaN(raw) || raw < 1 ? 1 : raw);
  }

  async onSkuScan(code: string): Promise<void> {
    const upperCode = code.trim().toUpperCase();
    const sampleSku = this.sampleSkuRepository.getSampleSkus().find((s) => s.code === upperCode);

    if (!sampleSku) {
      this.showFeedback('error', `SKU ${upperCode} no está en la muestra`);
      this.quantity.set(1);
      return;
    }

    const qty = this.quantity();
    let newQuantity = 0;

    this.countedItems.update((items) => {
      const index = items.findIndex((i) => i.sku.code === upperCode);
      if (index >= 0) {
        const updated = [...items];
        updated[index] = { ...items[index], quantity: items[index].quantity + qty };
        newQuantity = updated[index].quantity;
        return updated;
      }
      newQuantity = qty;
      return [...items, { sku: sampleSku, quantity: qty }];
    });

    this.showFeedback('success', `SKU ${upperCode} +${qty} (x${newQuantity})`);
    this.quantity.set(1);

    try {
      await this.persist();
    } catch (err) {
      this.showFeedback('error', 'Error al guardar');
      console.error('[CountingPage] persist failed:', err);
    }
  }

  private async persist(): Promise<void> {
    const current = this.session();
    if (!current) return;

    const updated = await this.countingFacade.updateItems({
      ...current,
      items: this.countedItems(),
    });
    this.session.set(updated);
  }

  private showFeedback(type: 'success' | 'error', text: string): void {
    this.feedback.set({ type, text });
    setTimeout(() => this.feedback.set(null), 1500);
  }

  async adjustQuantity(item: CountedItem, delta: number): Promise<void> {
    this.countedItems.update((items) =>
      items.map((i) => {
        if (i.sku.code !== item.sku.code) return i;
        return { ...i, quantity: Math.max(1, i.quantity + delta) };
      })
    );
    try {
      await this.persist();
    } catch (err) {
      this.showFeedback('error', 'Error al actualizar cantidad');
      console.error('[CountingPage] adjustQuantity persist failed:', err);
    }
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
          handler: async () => {
            try {
              this.countedItems.update((items) => items.filter((i) => i.sku.code !== item.sku.code));
              await this.persist();
            } catch (err) {
              this.showFeedback('error', 'Error al eliminar');
              console.error('[CountingPage] deleteItem persist failed:', err);
            }
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
    this.router.navigate(['/counting-list']);
  }

  async finalize(): Promise<void> {
    if (this.countedItems().length === 0) {
      this.showFeedback('error', 'No hay SKUs escaneados para finalizar');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Finalizar conteo',
      message: `Items: ${this.totalItems()}\nTotal unidades: ${this.totalQuantity()}`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Finalizar',
          handler: async () => {
            try {
              this.isFinalizing.set(true);
              const current = this.session();
              if (current) {
                await this.countingFacade.finalize({
                  ...current,
                  items: this.countedItems(),
                });
              }
              this.isFinalizing.set(false);
              this.router.navigate(['/counting-list']);
            } catch (err) {
              this.isFinalizing.set(false);
              this.showFeedback('error', 'Error al finalizar');
              console.error('[CountingPage] finalize failed:', err);
            }
          },
        },
      ],
    });
    await alert.present();
  }
}
