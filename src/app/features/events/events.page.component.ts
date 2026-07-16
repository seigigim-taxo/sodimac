import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';
import { EventFacade } from '../../state/event/event.facade';
import { StoreFacade } from '../../state/store/store.facade';
import { InventoryEvent } from '../../domain/event/models/event.model';

@Component({
  selector: 'app-events.page',
  templateUrl: './events.page.component.html',
  imports: [
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
export class EventsPageComponent implements ViewWillEnter {
  private router = inject(Router);
  private location = inject(Location);
  private storeFacade = inject(StoreFacade);
  private eventFacade = inject(EventFacade);

  events = this.eventFacade.events;
  selectedEvent = this.eventFacade.selectedEvent;
  currentEvent = this.eventFacade.currentEvent;
  loading = this.eventFacade.loading;
  error = this.eventFacade.error;
  hasEvents = this.eventFacade.hasEvents;
  noEvents = this.eventFacade.noEvents;
  currentStore = this.storeFacade.currentStore;

  constructor() {
    addIcons({ arrowBackOutline });
  }

  ionViewWillEnter(): void {
    const store = this.currentStore();
    if (store) {
      this.eventFacade.loadEvents(store.id);
    }
  }

  goBack(): void {
    this.location.back();
  }

  goHome(): void {
    this.router.navigate(['/home']);
  }

  selectEvent(event: InventoryEvent): void {
    this.eventFacade.selectEvent(event);
  }

  continue(): void {
    if (!this.currentEvent()) {
      return;
    }
    this.router.navigate(['/zone-select']);
  }

  formatDate(dateString: string): string {
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  }
}
