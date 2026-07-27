import { Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import {
  AlertController,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonButtons,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, businessOutline, lockClosedOutline } from 'ionicons/icons';
import { AuthFacade } from '../../state/auth/auth.facade';
import { SucursalFacade } from '../../state/sucursal/sucursal.facade';
import { EventoFacade, Evento } from '../../state/evento/evento.facade';
import { TagsMockStore } from '../../state/counting-mock/tags-mock.store';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  standalone: true,
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
export class HomePage implements ViewWillEnter {
  private router          = inject(Router);
  private auth             = inject(AuthFacade);
  private sucursalFacade  = inject(SucursalFacade);
  private eventoFacade    = inject(EventoFacade);
  private tagsStore       = inject(TagsMockStore);
  private alertController = inject(AlertController);

  puedeCerrarTienda = this.tagsStore.puedeCerrarTienda;

  currentStore  = this.sucursalFacade.currentStore;
  storeLoading  = this.sucursalFacade.loading;
  storeError    = this.sucursalFacade.error;
  noStores      = this.sucursalFacade.noStores;

  events        = this.eventoFacade.events;
  selectedEvent = this.eventoFacade.selectedEvent;
  eventsLoading = this.eventoFacade.loading;
  eventsError   = this.eventoFacade.error;
  hasEvents     = this.eventoFacade.hasEvents;
  noEvents      = this.eventoFacade.noEvents;

  constructor() {
    addIcons({ alertCircleOutline, businessOutline, lockClosedOutline });

    // En cuanto haya tienda cargada, pide sus eventos.
    effect(() => {
      const store = this.currentStore();
      if (store) void this.eventoFacade.loadEventos(store.id);
    });
  }

  ionViewWillEnter(): void {
    const session = this.auth.session();
    if (session) {
      void this.sucursalFacade.loadSucursales(session.operadorId);
    }
  }

  // Compara solo la fecha (YYYY-MM-DD), ignorando la hora — un evento de "hoy" siempre es seleccionable.
  esVencido(evento: Evento): boolean {
    const hoy = new Date().toISOString().slice(0, 10);
    return evento.fechaProgramada.slice(0, 10) < hoy;
  }

  esCerrado(evento: Evento): boolean {
    return evento.estado === 'CERRADO';
  }

  puedeSeleccionar(evento: Evento): boolean {
    return !this.esVencido(evento) && !this.esCerrado(evento);
  }

  tieneConteo(evento: Evento): boolean {
    return this.tagsStore.tieneConteo(evento.id);
  }

  resumenConteo(evento: Evento) {
    return this.tagsStore.resumenDe(evento.id);
  }

  selectEvento(evento: Evento): void {
    if (!this.puedeSeleccionar(evento)) return;
    this.eventoFacade.selectEvento(evento);
  }

  continue(): void {
    if (!this.selectedEvent()) return;
    this.router.navigate(['/counting']);
  }

  async cerrarTienda(): Promise<void> {
    if (!this.puedeCerrarTienda()) return;

    const alert = await this.alertController.create({
      header:  'Cerrar tienda',
      message: 'Esto finalizará tu jornada en esta tienda y cerrará tu sesión. ¿Confirmas?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Cerrar tienda', role: 'destructive', handler: () => { void this.doCerrarTienda(); } },
      ],
    });
    await alert.present();
  }

  private async doCerrarTienda(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }
}
