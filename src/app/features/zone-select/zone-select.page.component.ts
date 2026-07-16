import { Component, inject, signal, viewChild } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { AlertController, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonMenuButton, IonSelect, IonSelectOption, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';
import { ScanComponent } from 'src/app/shared/components/scan/scan.component';
import { CountingFacade } from 'src/app/state/counting/counting.facade';
import { ZONES } from 'src/app/shared/data/zones';
import type { Zone } from 'src/app/shared/data/zones';

@Component({
  selector: 'app-zone-select.page',
  templateUrl: './zone-select.page.component.html',
  imports: [
    ScanComponent,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonMenuButton,
    IonTitle,
    IonToolbar,
    IonSelect,
    IonSelectOption,
  ],
})
export class ZoneSelectPageComponent {
  private router = inject(Router);
  private location = inject(Location);
  private alertCtrl = inject(AlertController);
  private countingFacade = inject(CountingFacade);

  tagConfirmed = signal(false);
  tagCode = signal('');
  selectedZone = signal<Zone | null>(null);

  zones: Zone[] = ZONES;

  zoneSelect = viewChild<IonSelect>('zoneSelect');

  constructor() {
    addIcons({ arrowBackOutline });
  }

  onTagScan(value: string): void {
    this.tagCode.set(value);
    this.tagConfirmed.set(true);
    setTimeout(() => this.zoneSelect()?.open(), 200);
  }

  onTagReset(): void {
    this.tagConfirmed.set(false);
    this.tagCode.set('');
    this.selectedZone.set(null);
  }

  onZoneChange(event: Event): void {
    const select = event.target as HTMLIonSelectElement;
    const zone = this.zones.find((z) => z.id === Number(select.value));
    if (zone) this.selectedZone.set(zone);
  }

  goBack(): void {
    this.location.back();
  }

  async continue(): Promise<void> {
    if (!this.tagCode()) {
      const alert = await this.alertCtrl.create({
        header: 'Tag requerido',
        message: 'Escanea o ingresa el tag antes de continuar.',
        buttons: [{ text: 'OK' }],
      });
      await alert.present();
      return;
    }

    if (!this.selectedZone()) {
      const alert = await this.alertCtrl.create({
        header: 'Zona requerida',
        message: 'Selecciona una zona antes de continuar.',
        buttons: [{ text: 'OK' }],
      });
      await alert.present();
      return;
    }

    const session = await this.countingFacade.createNewSession(
      this.tagCode(),
      this.selectedZone()!.name
    );

    this.router.navigate(['/counting', session.id]);
  }
}
