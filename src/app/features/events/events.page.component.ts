import { Component, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';

interface EventItem {
  id: number;
  name: string;
  location: string;
  date: string;
}

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
    IonTitle,
    IonToolbar,
  ],
})
export class EventsPageComponent {
  private router = inject(Router);
  private location = inject(Location);

  events: EventItem[] = [
    { id: 1, name: 'Inventario General', location: 'Pasillo 1-15', date: '15/07/2026' },
    { id: 2, name: 'Conteo Cíclico', location: 'Bodega', date: '16/07/2026' },
  ];

  selectedEvent = signal<EventItem | null>(null);

  constructor() {
    addIcons({ arrowBackOutline });
  }

  goBack(): void {
    this.location.back();
  }

  selectEvent(event: EventItem): void {
    this.selectedEvent.set(event);
  }

  continue(): void {
    if (!this.selectedEvent()) return;
    this.router.navigate(['/zone-select']);
  }
}