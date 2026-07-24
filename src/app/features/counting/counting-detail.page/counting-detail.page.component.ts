import { Component, inject } from '@angular/core';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
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
import { addOutline, alertCircleOutline, checkmarkDoneOutline, cloudUploadOutline, removeOutline, trashOutline } from 'ionicons/icons';
import { ConteoDetalleFacade } from '../../../state/conteo/conteo-detalle.facade';

@Component({
  selector: 'app-counting-detail',
  templateUrl: './counting-detail.page.component.html',
  standalone: true,
  imports: [
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonMenuButton,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class CountingDetailPageComponent {
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);
  private detalleFacade   = inject(ConteoDetalleFacade);

  resumen  = this.detalleFacade.resumen;
  items    = this.detalleFacade.items;
  loading  = this.detalleFacade.loading;
  error    = this.detalleFacade.error;
  editable = this.detalleFacade.editable;
  noItems  = this.detalleFacade.noItems;
  syncing  = this.detalleFacade.syncing;

  constructor() {
    addIcons({ addOutline, removeOutline, trashOutline, alertCircleOutline, checkmarkDoneOutline, cloudUploadOutline });
  }

  async sincronizar(): Promise<void> {
    await this.detalleFacade.sincronizar();
    if (this.detalleFacade.error()) return; // error ya visible en la página

    const toast = await this.toastController.create({
      message:  'Conteo sincronizado',
      duration: 2500,
      color:    'success',
      position: 'top',
    });
    await toast.present();
  }

  adjust(productoId: number, delta: number): void {
    void this.detalleFacade.adjust(productoId, delta);
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
          handler: () => { void this.detalleFacade.delete(productoId); },
        },
      ],
    });
    await alert.present();
  }
}
