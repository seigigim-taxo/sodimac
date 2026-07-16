import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';
import { ScanComponent } from 'src/app/shared/components/scan/scan.component';
import { AuthFacade } from '../../state/auth/auth.facade';
import { EventFacade } from '../../state/event/event.facade';
import { StoreFacade } from '../../state/store/store.facade';
import { ZoneFacade } from '../../state/zone/zone.facade';
import { Zone } from '../../domain/zone/models/zone.model';

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
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class ZoneSelectPageComponent implements ViewWillEnter {
  private router = inject(Router);
  private location = inject(Location);
  private auth = inject(AuthFacade);
  private eventFacade = inject(EventFacade);
  private storeFacade = inject(StoreFacade);
  private zoneFacade = inject(ZoneFacade);

  currentStore = this.storeFacade.currentStore;
  currentEvent = this.eventFacade.currentEvent;

  zones = this.zoneFacade.zones;
  selectedZone = this.zoneFacade.selectedZone;
  tagConfirmed = this.zoneFacade.tagConfirmed;
  tagValue = this.zoneFacade.tagValue;
  loading = this.zoneFacade.loading;
  error = this.zoneFacade.error;
  hasZones = this.zoneFacade.hasZones;
  noZones = this.zoneFacade.noZones;
  canContinue = this.zoneFacade.canContinue;

  constructor() {
    addIcons({ arrowBackOutline });
  }

  ionViewWillEnter(): void {
    const event = this.currentEvent();
    const session = this.auth.session();
    if (event && session) {
      this.zoneFacade.loadZones(event.id, session.userId);
    }
  }

  onTagScan(value: string): void {
    this.zoneFacade.confirmTag(value);
  }

  onZoneChange(event: Event): void {
    const select = event.target as HTMLIonSelectElement;
    const zone = this.zones().find((z) => z.id === Number(select.value));
    if (zone) {
      this.zoneFacade.selectZone(zone);
    }
  }

  goBack(): void {
    this.location.back();
  }

  goEvents(): void {
    this.router.navigate(['/events']);
  }

  continue(): void {
    if (!this.canContinue()) {
      return;
    }
    this.router.navigate(['/counting']);
  }
}
