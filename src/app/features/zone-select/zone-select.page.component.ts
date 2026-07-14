import { Component, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonMenuButton, IonSelect, IonSelectOption, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';
import { ScanComponent } from 'src/app/shared/components/scan/scan.component';

interface Zone {
  id: number;
  name: string;
}

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

  tagConfirmed = signal(false);
  selectedZone = signal<Zone | null>(null);

  zones: Zone[] = [
    { id: 1, name: 'Pasillo 1' },
    { id: 2, name: 'Pasillo 2' },
    { id: 3, name: 'Altillo' },
    { id: 4, name: 'Bodega' },
  ];

  constructor() {
    addIcons({ arrowBackOutline });
  }

  onTagScan(value: string): void {
    this.tagConfirmed.set(true);
  }

  onZoneChange(event: Event): void {
    const select = event.target as HTMLIonSelectElement;
    const zone = this.zones.find(z => z.id === Number(select.value));
    if (zone) this.selectedZone.set(zone);
  }

  goBack(): void {
    this.location.back();
  }

  continue(): void {
    if (!this.selectedZone()) return;
    this.router.navigate(['/counting']);
  }
}
