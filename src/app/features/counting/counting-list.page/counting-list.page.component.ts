import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
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
import { alertCircleOutline, checkmarkDoneOutline, cloudUploadOutline, createOutline, eyeOutline, playOutline, timeOutline, trashOutline } from 'ionicons/icons';
import { AuthFacade } from '../../../state/auth/auth.facade';
import { PdaFacade } from '../../../state/pda/pda.facade';
import { ConteoListFacade, ConteoResumen } from '../../../state/conteo/conteo-list.facade';
import { ConteoDetalleFacade } from '../../../state/conteo/conteo-detalle.facade';

@Component({
  selector: 'app-counting-list',
  templateUrl: './counting-list.page.component.html',
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
export class CountingListPageComponent implements ViewWillEnter {
  private router          = inject(Router);
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);
  private authFacade      = inject(AuthFacade);
  private pdaFacade       = inject(PdaFacade);
  private listFacade      = inject(ConteoListFacade);
  private detalleFacade   = inject(ConteoDetalleFacade);

  conteos       = this.listFacade.conteos;
  enCurso       = this.listFacade.enCurso;
  finalizados   = this.listFacade.finalizados;
  sincronizados = this.listFacade.sincronizados;
  noConteos     = this.listFacade.noConteos;
  loading       = this.listFacade.loading;
  error         = this.listFacade.error;

  // Pestaña activa; "En curso" es la de entrada por defecto — es lo primero que el operador retoma.
  tab = signal<'enCurso' | 'pendientes' | 'sincronizados'>('enCurso');

  constructor() {
    addIcons({ alertCircleOutline, checkmarkDoneOutline, cloudUploadOutline, createOutline, eyeOutline, playOutline, timeOutline, trashOutline });
  }

  setTab(tab: 'enCurso' | 'pendientes' | 'sincronizados'): void {
    this.tab.set(tab);
  }

  ionViewWillEnter(): void {
    const operadorId = this.authFacade.session()?.operadorId;
    const pdaId      = this.pdaFacade.pdaId();
    if (operadorId && pdaId) {
      void this.listFacade.load(operadorId, pdaId);
    }
  }

  /*
   * sod_ubicacion se reutiliza por (zona_id, tag) sin importar el evento, así
   * que la misma ubicacionId puede repetirse en conteos de eventos distintos.
   * La identidad real de un ConteoResumen es (eventoId, ubicacionId, estado).
   */
  trackConteo(conteo: ConteoResumen): string {
    return `${conteo.eventoId}-${conteo.ubicacionId}-${conteo.estado}`;
  }

  continuar(conteo: ConteoResumen): void {
    this.listFacade.seleccionar(conteo);
    this.router.navigate(['/counting']);
  }

  verDetalle(conteo: ConteoResumen): void {
    void this.detalleFacade.load(conteo);
    this.router.navigate(['/counting-detail']);
  }

  isSyncing(conteo: ConteoResumen): boolean {
    return this.listFacade.isSyncing(conteo);
  }

  async sincronizar(conteo: ConteoResumen): Promise<void> {
    await this.listFacade.sincronizar(conteo);
    if (this.listFacade.error()) return; // error ya visible en la card / arriba de la lista

    const toast = await this.toastController.create({
      message:  `Conteo de ${conteo.zonaCodigo} sincronizado`,
      duration: 2500,
      color:    'success',
      position: 'top',
    });
    await toast.present();
  }

  async eliminar(conteo: ConteoResumen): Promise<void> {
    const alert = await this.alertController.create({
      header:  'Eliminar conteo',
      message: `¿Eliminar el conteo de ${conteo.zonaCodigo} (TAG ${conteo.tag ?? '—'}) con ${conteo.totalProductos} producto(s)? Esta acción no se puede deshacer.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text:    'Eliminar',
          role:    'destructive',
          handler: () => { void this.listFacade.delete(conteo); },
        },
      ],
    });
    await alert.present();
  }
}
