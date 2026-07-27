import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, checkmarkDoneOutline, cloudUploadOutline, refreshOutline, timeOutline } from 'ionicons/icons';
import { TagsMockStore } from '../../../state/counting-mock/tags-mock.store';

/*
 * MOCK — resumen de tags con 2 estados: Pendiente (finalizado localmente,
 * sync falló, encolado) y Finalizado (sincronizado con éxito). Lee del
 * mismo TagsMockStore que la pantalla de trabajo, así que refleja en vivo
 * lo que se va cerrando ahí. El tag EN CURSO (el que se está contando
 * ahora, antes de "Finalizar TAG") no aparece aquí a propósito: su
 * recuperación tras un apagón es un problema de persistencia que resuelve
 * la propia pantalla de trabajo al reabrirse, no algo que este resumen
 * necesite mostrar.
 */
@Component({
  selector: 'app-tags-resumen',
  templateUrl: './tags-resumen.page.component.html',
  standalone: true,
  imports: [
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonMenuButton,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class TagsResumenPageComponent {
  private tagsStore       = inject(TagsMockStore);
  private router          = inject(Router);
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);

  pendientes    = this.tagsStore.pendientes;
  finalizados   = this.tagsStore.finalizados;
  sincronizando = this.tagsStore.sincronizando;
  noTags        = () => this.pendientes().length === 0 && this.finalizados().length === 0;

  // Resumen final del conteo
  totalMuestra    = this.tagsStore.totalMuestra;
  totalContados   = this.tagsStore.totalContados;
  totalFaltantes  = this.tagsStore.totalFaltantes;
  todosEnviados   = this.tagsStore.todosEnviados;

  constructor() {
    addIcons({ alertCircleOutline, checkmarkDoneOutline, cloudUploadOutline, refreshOutline, timeOutline });
  }

  reintentar(codigo: string): void {
    this.tagsStore.reintentar(codigo);
  }

  async finalizarConteo(): Promise<void> {
    if (!this.todosEnviados()) return;

    const alert = await this.alertController.create({
      header:  'Finalizar conteo',
      message: `Contados ${this.totalContados()} de ${this.totalMuestra()} productos${this.totalFaltantes() > 0 ? ` (${this.totalFaltantes()} sin contar)` : ''}. Esta acción no se puede deshacer. ¿Confirmas?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Finalizar', role: 'confirm', handler: () => { void this.doFinalizarConteo(); } },
      ],
    });
    await alert.present();
  }

  private async doFinalizarConteo(): Promise<void> {
    const toast = await this.toastController.create({
      message:  'Conteo finalizado — todos los TAGs sincronizados',
      duration: 2500,
      color:    'success',
      position: 'top',
    });
    await toast.present();
    this.router.navigate(['/home']);
  }
}
