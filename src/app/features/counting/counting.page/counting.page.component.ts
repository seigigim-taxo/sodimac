import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
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
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, alertCircleOutline, closeCircleOutline, homeOutline, removeOutline, trashOutline } from 'ionicons/icons';
import { ScanComponent } from '../../../shared/components/scan/scan.component';
import { AuthFacade } from '../../../state/auth/auth.facade';
import { ConteoFacade } from '../../../state/conteo/conteo.facade';
import { ConteoListFacade } from '../../../state/conteo/conteo-list.facade';
import { EventoFacade } from '../../../state/evento/evento.facade';
import { PdaFacade } from '../../../state/pda/pda.facade';
import { ZonaFacade } from '../../../state/zona/zona.facade';

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
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class CountingPageComponent implements ViewWillEnter {
  private router          = inject(Router);
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);
  private authFacade      = inject(AuthFacade);
  private eventoFacade    = inject(EventoFacade);
  private zonaFacade      = inject(ZonaFacade);
  private pdaFacade       = inject(PdaFacade);
  private conteoFacade    = inject(ConteoFacade);
  private conteoList      = inject(ConteoListFacade);

  sesion     = this.conteoFacade.sesion;
  items      = this.conteoFacade.items;
  rechazados = this.conteoFacade.rechazados;
  loading    = this.conteoFacade.loading;
  error      = this.conteoFacade.error;
  enCurso    = this.conteoFacade.enCurso;
  totalItems = this.conteoFacade.totalItems;

  // Feedback del último scan: verde solo si el SKU existe en la muestra.
  // Se autolimpia a los 3s (ver scheduleLastScanClear).
  lastScan = signal<{ sku: string; valido: boolean } | null>(null);
  private lastScanTimeoutId: ReturnType<typeof setTimeout> | undefined;

  // Cantidad a registrar en el próximo scan; vuelve a 1 después de cada registro
  cantidad = signal(1);

  constructor() {
    addIcons({
      addOutline,
      removeOutline,
      trashOutline,
      alertCircleOutline,
      closeCircleOutline,
      homeOutline,
    });
  }

  async ionViewWillEnter(): Promise<void> {
    /*
     * Dos vías de entrada. La selección explícita desde la lista de conteos
     * tiene prioridad y se consume una sola vez; solo si no hay selección se
     * usa el flujo de zona (evento seleccionado + ubicación recién confirmada).
     * Nunca se mezclan campos de ambas fuentes.
     */
    const seleccionado = this.conteoList.consumirSeleccion();

    let eventoId:    number | undefined;
    let ubicacionId: number | undefined;
    if (seleccionado) {
      eventoId    = seleccionado.eventoId;
      ubicacionId = seleccionado.ubicacionId;
    } else {
      eventoId    = this.eventoFacade.selectedEvent()?.id;
      ubicacionId = this.zonaFacade.ubicacionId() ?? undefined;
    }

    const operadorId = this.authFacade.session()?.operadorId;
    const pdaId      = this.pdaFacade.pdaId();

    if (!eventoId || !ubicacionId || !operadorId || !pdaId) {
      // Sin datos suficientes: limpiar para no mostrar la sesión anterior como actual
      this.conteoFacade.reset();
      this.clearLastScan();
      return;
    }

    this.clearLastScan();
    await this.conteoFacade.init(eventoId, ubicacionId, operadorId, pdaId);

    if (this.conteoFacade.recovered()) {
      const toast = await this.toastController.create({
        message:  'Sesión de conteo recuperada',
        duration: 3000,
        color:    'warning',
        position: 'top',
      });
      await toast.present();
    }
  }

  onCantidadInput(event: Event): void {
    const value = Number((event as CustomEvent<{ value: string | null }>).detail.value);
    this.cantidad.set(Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1);
  }

  async onScan(sku: string): Promise<void> {
    const resultado = await this.conteoFacade.scan(sku, this.cantidad());
    // 'error': sin banner verde/rojo — el error pill del facade ya explica el fallo
    if (resultado === 'error') {
      this.clearLastScan();
    } else {
      this.setLastScan({ sku, valido: resultado === 'valido' });
    }
    this.cantidad.set(1);
  }

  // Muestra el feedback del scan y lo retira solo a los 3s (cancela el timer anterior si había uno).
  private setLastScan(scan: { sku: string; valido: boolean }): void {
    clearTimeout(this.lastScanTimeoutId);
    this.lastScan.set(scan);
    this.lastScanTimeoutId = setTimeout(() => this.lastScan.set(null), 3000);
  }

  private clearLastScan(): void {
    clearTimeout(this.lastScanTimeoutId);
    this.lastScan.set(null);
  }

  adjust(productoId: number, delta: number): void {
    void this.conteoFacade.adjust(productoId, delta);
  }

  async delete(productoId: number): Promise<void> {
    const item = this.items().find((i) => i.productoId === productoId);
    if (!item) return;

    const alert = await this.alertController.create({
      header:  'Eliminar producto',
      message: `¿Eliminar ${item.descripcion ?? item.sku} (cantidad ${item.cantidadFisica}) del conteo?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text:    'Eliminar',
          role:    'destructive',
          handler: () => { void this.conteoFacade.delete(productoId); },
        },
      ],
    });
    await alert.present();
  }

  async finalizar(): Promise<void> {
    const alert = await this.alertController.create({
      header:  'Finalizar conteo',
      message: `Vas a finalizar el conteo con ${this.totalItems()} producto(s). Esta acción no se puede deshacer.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text:    'Finalizar',
          role:    'confirm',
          handler: () => { void this.doFinalizar(); },
        },
      ],
    });
    await alert.present();
  }

  goZoneSelect(): void {
    this.router.navigate(['/zone-select']);
  }

  goHome(): void {
    this.router.navigate(['/home']);
  }

  private async doFinalizar(): Promise<void> {
    try {
      await this.conteoFacade.finalizar();
      // La ubicación del flujo de zona ya se consumió: limpiarla evita que
      // una próxima entrada a /counting reabra esta ubicación por accidente.
      this.zonaFacade.reset();
      this.router.navigate(['/counting-list']);
    } catch {
      // error ya visible en conteoFacade.error()
    }
  }
}
