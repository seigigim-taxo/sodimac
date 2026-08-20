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
  IonSpinner,
  AlertController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, logOutOutline, sunnyOutline, moonOutline, listOutline, homeOutline, cloudUploadOutline, cloudOfflineOutline, saveOutline } from 'ionicons/icons';
import { AuthFacade } from './state/auth/auth.facade';
import { SesionTrabajoFacade } from './state/sesion-trabajo/sesion-trabajo.facade';
import { RespaldoFacade } from './state/respaldo/respaldo.facade';
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
    IonSpinner,
    BotonBuscadorComponent,
  ],
})
export class AppComponent {
  private auth     = inject(AuthFacade);
  private sesionTrabajo = inject(SesionTrabajoFacade);
  private respaldo = inject(RespaldoFacade);
  private theme    = inject(ThemeFacade);
  private ajustes  = inject(AjustesFacade);
  private router   = inject(Router);
  private location = inject(Location);
  private alertController = inject(AlertController);

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
  generandoRespaldo = this.respaldo.generando;

  mostrarBuscador = computed(() =>
    this.session() !== null &&
    !AppComponent.RUTAS_SIN_BUSCADOR.some((r) => this.rutaActual().startsWith(r))
  );



  constructor() {
    addIcons({
      arrowBackOutline, logOutOutline, sunnyOutline, moonOutline, listOutline,
      homeOutline, cloudUploadOutline, cloudOfflineOutline, saveOutline,
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
    /*
     * El estado de trabajo vive en signals de facades singleton: no se va con la
     * sesión. Si no se limpia acá, el operador que entre después hereda evento,
     * TAG e ítems del anterior.
     */
    await this.sesionTrabajo.limpiar();
    this.router.navigate(['/login']);
  }

  async toggleTheme(): Promise<void> {
    await this.theme.toggle();
  }

  /*
   * El menú se cierra solo (ion-menu-toggle) apenas se toca la opción, así que
   * el aviso de "en curso" va en el propio item mientras dura, y el resultado
   * llega por alerta: es lo único que sigue visible con el menú cerrado.
   */
  async respaldarBase(): Promise<void> {
    const resultado = await this.respaldo.generar();

    if (!resultado) {
      const error = this.respaldo.error();
      if (!error) return; // ya había un respaldo corriendo: no hay nada que avisar
      await this.mostrarAlerta('No se pudo respaldar', error);
      return;
    }

    /*
     * Texto plano con saltos de línea, no HTML: Ionic trae innerHTML
     * deshabilitado en las alertas y abrirlo globalmente por un mensaje no se
     * justifica. La clase alerta-respaldo respeta los \n y corta la ruta larga.
     */
    await this.mostrarAlerta(
      'Respaldo guardado',
      `${resultado.archivo}\n${formatearPeso(resultado.bytes)}\n\nQuedó guardado en:\n${resultado.carpeta}`
    );
  }

  private async mostrarAlerta(header: string, message: string): Promise<void> {
    const alert = await this.alertController.create({
      header,
      message,
      cssClass: 'alerta-respaldo',
      buttons: ['Entendido'],
    });
    await alert.present();
  }
}

function formatearPeso(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
