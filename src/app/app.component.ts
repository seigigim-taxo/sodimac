import { Component, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular/standalone';
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
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, logOutOutline, sunnyOutline, moonOutline, listOutline, homeOutline, cloudUploadOutline, cloudOfflineOutline, statsChartOutline, syncOutline, paperPlaneOutline, saveOutline, cloudDownloadOutline } from 'ionicons/icons';
import { AuthFacade } from './state/auth/auth.facade';
import { SesionTrabajoFacade } from './state/sesion-trabajo/sesion-trabajo.facade';
import { ThemeFacade } from './state/theme/theme.facade';
import { AjustesFacade } from './state/ajustes/ajustes.facade';
import { VigenciaDiaService } from './shared/services/vigencia-dia.service';
import { EnviarPendientesFacade } from './state/sincronizacion/enviar-pendientes.facade';
import { RespaldoFacade } from './state/respaldo/respaldo.facade';
import { BotonBuscadorComponent } from './shared/components/boton-buscador/boton-buscador.component';
import { formatRutDisplay } from './shared/utils/rut.utils';
import { APP_VERSION } from './core/version';
import { App } from '@capacitor/app';
import { OfertaActualizacionService } from './shared/services/oferta-actualizacion.service';

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
  private theme    = inject(ThemeFacade);
  private ajustes  = inject(AjustesFacade);
  private vigenciaDia = inject(VigenciaDiaService);
  private enviarPendientes = inject(EnviarPendientesFacade);
  private respaldo = inject(RespaldoFacade);
  private alertController = inject(AlertController);
  private oferta = inject(OfertaActualizacionService);
  private toastController = inject(ToastController);
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
  enviandoPendientes = this.enviarPendientes.enviando;
  generandoRespaldo = this.respaldo.generando;
  version = APP_VERSION;

  mostrarBuscador = computed(() =>
    this.session() !== null &&
    this.auth.isOperator() &&
    !AppComponent.RUTAS_SIN_BUSCADOR.some((r) => this.rutaActual().startsWith(r))
  );

  constructor() {
    addIcons({
      arrowBackOutline, logOutOutline, sunnyOutline, moonOutline, listOutline,
      homeOutline, cloudUploadOutline, cloudOfflineOutline, statsChartOutline, syncOutline,
      paperPlaneOutline, saveOutline,
      cloudDownloadOutline,
    });

    this.router.events.subscribe((evento) => {
      if (evento instanceof NavigationEnd) this.rutaActual.set(evento.urlAfterRedirects);
    });

    /*
     * Se arranca acá y no en una página: el cambio de día tiene que detectarse
     * esté donde esté el operador, incluso a mitad de un conteo.
     */
    this.vigenciaDia.iniciar();
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

  async enviarPendientesMenu(): Promise<void> {
    if (this.enviarPendientes.enviando()) return;
    const resultado = await this.enviarPendientes.enviar();
    const toast = await this.toastController.create({
      message: resultado.total === 0
        ? 'No hay envíos pendientes.'
        : `Enviados: ${resultado.enviados} | Con error: ${resultado.conError}`,
      duration: 3000,
      color: resultado.conError > 0 ? 'warning' : 'success',
      position: 'top',
    });
    await toast.present();
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
   * El menú se cierra solo apenas se toca la opción, así que el aviso de "en
   * curso" va en el propio item mientras dura y el resultado llega por alerta:
   * es lo único que sigue visible con el menú cerrado.
   */
  async respaldarBase(): Promise<void> {
    const resultado = await this.respaldo.generar();

    if (!resultado) {
      const error = this.respaldo.error();
      if (!error) return; // ya había un respaldo corriendo: no hay nada que avisar
      await this.mostrarAlertaRespaldo('No se pudo respaldar', error);
      return;
    }

    /*
     * Texto plano con saltos de línea, no HTML: Ionic trae innerHTML
     * deshabilitado en las alertas y abrirlo globalmente por un mensaje no se
     * justifica. La clase alerta-respaldo respeta los \n y corta la ruta larga.
     */
    await this.mostrarAlertaRespaldo(
      'Respaldo guardado',
      `${resultado.archivo}\n${formatearPeso(resultado.bytes)}\n\nQuedó guardado en:\n${resultado.carpeta}`
    );
  }

  /*
   * ACTUALIZACIÓN DE LA APP
   *
   * El flujo entero —confirmación, permiso de Android, reintento al volver de
   * Ajustes— vive en OfertaActualizacionService. Acá quedó solo la entrada del
   * menú, porque hay otra: la franja de Inicio, que ofrece lo mismo cuando la
   * app detecta sola que hay versión nueva.
   */
  buscandoActualizacion    = this.oferta.buscando;
  descargandoActualizacion = this.oferta.descargando;
  porcentajeActualizacion  = this.oferta.porcentaje;

  async buscarActualizacion(): Promise<void> {
    await this.oferta.buscarYResponder();
  }

  private async mostrarAlertaRespaldo(header: string, message: string): Promise<void> {
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
