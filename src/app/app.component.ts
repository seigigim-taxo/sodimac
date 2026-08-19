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
import { arrowBackOutline, logOutOutline, sunnyOutline, moonOutline, listOutline, homeOutline, cloudUploadOutline, cloudOfflineOutline, statsChartOutline, syncOutline } from 'ionicons/icons';
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

  private static readonly RUTAS_SIN_BUSCADOR = ['/login', '/sync-loading'];

  private rutaActual = signal(this.router.url);

  session          = this.auth.session;
  isDark           = this.theme.isDark;
  isAnalyst        = this.auth.isAnalyst;
  isOperator       = this.auth.isOperator;
  formatRutDisplay = formatRutDisplay;
  sincronizacionAutomatica = this.ajustes.sincronizacionAutomatica;

  mostrarBuscador = computed(() =>
    this.session() !== null &&
    this.auth.isOperator() &&
    !AppComponent.RUTAS_SIN_BUSCADOR.some((r) => this.rutaActual().startsWith(r))
  );

  constructor() {
    addIcons({
      arrowBackOutline, logOutOutline, sunnyOutline, moonOutline, listOutline,
      homeOutline, cloudUploadOutline, cloudOfflineOutline, statsChartOutline, syncOutline,
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

  goAnalystDashboard(): void {
    this.router.navigate(['/analyst-dashboard']);
  }

  goConteos(): void {
    this.router.navigate(['/tags-resumen']);
  }

  syncDatos(): void {
    this.router.navigate(['/sync-loading']);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }

  async toggleTheme(): Promise<void> {
    await this.theme.toggle();
  }
}
