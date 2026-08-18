import { Component, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import {
  IonApp,
  IonRouterOutlet,
  IonMenu,
  IonMenuToggle,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonButton,
  IonButtons,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, logOutOutline, sunnyOutline, moonOutline, listOutline, homeOutline, cloudUploadOutline, cloudOfflineOutline } from 'ionicons/icons';
import { AuthFacade } from './state/auth/auth.facade';
import { ThemeFacade } from './state/theme/theme.facade';
import { AjustesFacade } from './state/ajustes/ajustes.facade';
import { BotonBuscadorComponent } from './shared/components/boton-buscador/boton-buscador.component';
import { formatRutDisplay } from './shared/utils/rut.utils';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [
    IonApp,
    IonRouterOutlet,
    IonMenu,
    IonMenuToggle,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonButton,
    IonButtons,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    BotonBuscadorComponent,
  ],
})
export class AppComponent {
  private auth     = inject(AuthFacade);
  private theme    = inject(ThemeFacade);
  private ajustes  = inject(AjustesFacade);
  private router   = inject(Router);
  private location = inject(Location);

  /*
   * Pantallas sin buscador: login, donde no hay sesión ni evento donde buscar,
   * y la descarga inicial, que es un paso bloqueante — ofrecer una acción ahí
   * invita a interrumpirla.
   */
  private static readonly RUTAS_SIN_BUSCADOR = ['/login', '/sync-loading'];

  private rutaActual = signal(this.router.url);

  session          = this.auth.session;
  isDark           = this.theme.isDark;
  formatRutDisplay = formatRutDisplay;
  sincronizacionAutomatica = this.ajustes.sincronizacionAutomatica;

  mostrarBuscador = computed(() =>
    this.session() !== null &&
    !AppComponent.RUTAS_SIN_BUSCADOR.some((r) => this.rutaActual().startsWith(r))
  );



  constructor() {
    addIcons({
      arrowBackOutline, logOutOutline, sunnyOutline, moonOutline, listOutline,
      homeOutline, cloudUploadOutline, cloudOfflineOutline,
    });

    this.router.events.subscribe((evento) => {
      if (evento instanceof NavigationEnd) this.rutaActual.set(evento.urlAfterRedirects);
    });
  }

  async toggleSincronizacionAutomatica(): Promise<void> {
    await this.ajustes.toggleSincronizacionAutomatica();
  }

  goBack(): void {
    this.location.back();
  }

  goHome(): void {
    this.router.navigate(['/home']);
  }

  goConteos(): void {
    this.router.navigate(['/tags-resumen']);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }

  async toggleTheme(): Promise<void> {
    await this.theme.toggle();
  }
}
