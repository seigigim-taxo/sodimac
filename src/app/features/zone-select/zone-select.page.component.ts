import { Component, ViewChild, inject } from '@angular/core';
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
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, barcodeOutline } from 'ionicons/icons';
import { ScanComponent } from '../../shared/components/scan/scan.component';
import { AuthFacade } from '../../state/auth/auth.facade';
import { EventoFacade } from '../../state/evento/evento.facade';
import { SucursalFacade } from '../../state/store/store.facade';
import { ZonaFacade } from '../../state/zona/zona.facade';
import { Zona } from '../../domain/zona/models/zona.model';

@Component({
  selector: 'app-zone-select',
  templateUrl: './zone-select.page.component.html',
  standalone: true,
  imports: [
    ScanComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class ZoneSelectPageComponent implements ViewWillEnter {
  @ViewChild('zoneSelect') zoneSelect!: IonSelect;

  private router          = inject(Router);
  private alertController = inject(AlertController);
  private authFacade      = inject(AuthFacade);
  private eventoFacade    = inject(EventoFacade);
  private sucursalFacade  = inject(SucursalFacade);
  private zonaFacade      = inject(ZonaFacade);

  currentStore = this.sucursalFacade.currentStore;
  currentEvent = this.eventoFacade.selectedEvent;
  zones        = this.zonaFacade.zones;
  selectedZone = this.zonaFacade.selectedZone;
  tagValue     = this.zonaFacade.tagValue;
  loading      = this.zonaFacade.loading;
  error        = this.zonaFacade.error;
  hasZones     = this.zonaFacade.hasZones;
  noZones      = this.zonaFacade.noZones;
  canContinue  = this.zonaFacade.canContinue;

  constructor() {
    addIcons({ alertCircleOutline, barcodeOutline });
  }

  ionViewWillEnter(): void {
    this.zonaFacade.reset();
    const eventoId   = this.currentEvent()?.id;
    const operadorId = this.authFacade.session()?.operadorId;
    if (eventoId && operadorId) {
      void this.zonaFacade.loadZonas(eventoId, operadorId);
    }
  }

  onTagScan(tag: string): void {
    this.zonaFacade.setTag(tag);
    requestAnimationFrame(() => this.zoneSelect?.open());
  }

  onZoneChange(event: Event): void {
    const zona = (event as CustomEvent<{ value: Zona | null }>).detail.value;
    if (!zona) return;
    this.zonaFacade.selectZona(zona);
  }

  async continue(): Promise<void> {
    if (!this.canContinue()) return;
    const zona = this.selectedZone()!;
    const tag  = this.tagValue();

    const alert = await this.alertController.create({
      header:  'Confirmar zona',
      message: `¿Confirmas la zona ${zona.codigo}${zona.nombre ? ' — ' + zona.nombre : ''} con TAG ${tag}?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Confirmar',
          role: 'confirm',
          handler: () => { void this.doConfirm(); },
        },
      ],
    });
    await alert.present();
  }

  private async doConfirm(): Promise<void> {
    try {
      await this.zonaFacade.confirmZona();
      this.router.navigate(['/counting']);
    } catch {
      // error ya visible en zonaFacade.error()
    }
  }

  goEvents(): void {
    this.router.navigate(['/events']);
  }
}
