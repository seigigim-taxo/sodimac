import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonBackButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline } from 'ionicons/icons';
import { EventoFacade, Evento } from '../../state/evento/evento.facade';
import { SucursalFacade } from '../../state/store/store.facade';

@Component({
  selector: 'app-events',
  templateUrl: './events.page.component.html',
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonBackButton,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class EventsPageComponent implements OnInit {
  private router         = inject(Router);
  private eventoFacade   = inject(EventoFacade);
  private sucursalFacade = inject(SucursalFacade);

  events        = this.eventoFacade.events;
  selectedEvent = this.eventoFacade.selectedEvent;
  loading       = this.eventoFacade.loading;
  error         = this.eventoFacade.error;
  hasEvents     = this.eventoFacade.hasEvents;
  noEvents      = this.eventoFacade.noEvents;

  constructor() {
    addIcons({ alertCircleOutline });
  }

  ngOnInit(): void {
    const store = this.sucursalFacade.currentStore();
    if (store) {
      void this.eventoFacade.loadEventos(store.id);
    }
  }

  selectEvento(evento: Evento): void {
    this.eventoFacade.selectEvento(evento);
  }

  continue(): void {
    if (!this.selectedEvent()) return;
    this.router.navigate(['/zone-select']);
  }
}
