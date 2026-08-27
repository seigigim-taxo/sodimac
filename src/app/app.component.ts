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
import { ActualizacionFacade } from './state/actualizacion/actualizacion.facade';

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
  private actualizacion = inject(ActualizacionFacade);
  private alertController = inject(AlertController);
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
   * El flujo completo vive acá porque el menú se cierra al tocar la opción y
   * todo lo que sigue tiene que ser una alerta: es lo único que queda visible.
   *
   * La primera vez el operador pasa por Ajustes a conceder "instalar apps
   * desconocidas" —Android lo exige a mano, una vez por equipo—. Se le explica
   * antes de mandarlo, y al volver retoma solo: no tiene que buscar el botón
   * otra vez.
   */
  buscandoActualizacion    = computed(() => this.actualizacion.buscando());
  descargandoActualizacion = computed(() => this.actualizacion.descargando());
  porcentajeActualizacion  = computed(() => this.actualizacion.porcentaje());

  async buscarActualizacion(): Promise<void> {
    if (this.actualizacion.buscando() || this.actualizacion.descargando()) return;

    const hay = await this.actualizacion.buscar();

    if (!hay) {
      const error = this.actualizacion.error();
      await this.mostrarAlertaRespaldo(
        error ? 'No se pudo consultar' : 'La app está al día',
        error ?? `Estás usando la última versión disponible (${APP_VERSION}).`
      );
      return;
    }

    const version = this.actualizacion.disponible()!;
    const alert = await this.alertController.create({
      header: `Versión ${version.versionName} disponible`,
      /*
       * Sin lista de cambios. Las notas del manifiesto las escribe quien
       * publica la APK y salen en lenguaje de desarrollo —"UID por producto"—,
       * que al operador no le dice nada y le ocupa el lugar de lo único que sí
       * necesita saber: que no pierde su trabajo y que la app se va a cerrar.
       */
      message: [
        'Tus conteos no se pierden.',
        'La app se va a cerrar para instalarse. Volvé a entrar cuando termine.',
      ].join('\n\n'),
      cssClass: 'alerta-respaldo',
      buttons: [
        // Posponer sólo si la versión no es obligatoria. Con obligatoria en
        // true el operador no puede seguir trabajando con una versión que el
        // servidor marcó como no apta.
        ...(version.obligatoria ? [] : [{ text: 'Ahora no', role: 'cancel' }]),
        { text: 'Actualizar', role: 'confirm', handler: () => { void this.doActualizar(); } },
      ],
    });
    await alert.present();
  }

  private async doActualizar(): Promise<void> {
    const resultado = await this.actualizacion.actualizar();

    switch (resultado.estado) {
      case 'INSTALANDO':
        // El instalador de Android ya está en pantalla y va a cerrar la app.
        // No hay nada más que decir ni ningún callback de éxito que esperar.
        return;

      case 'SIN_PERMISO':
        await this.pedirPermisoInstalacion();
        return;

      case 'DESCARGA_CORRUPTA':
        await this.mostrarAlertaRespaldo(
          'La descarga falló',
          'El archivo llegó incompleto, seguramente por la señal.\n\nProbá de nuevo con mejor cobertura.'
        );
        return;

      case 'ERROR':
        await this.mostrarAlertaRespaldo('No se pudo actualizar', resultado.mensaje);
        return;
    }
  }

  /*
   * Android no avisa cuándo el operador concedió el permiso: vuelve con el
   * botón de atrás y listo. Por eso se engancha el retorno de la app a primer
   * plano y se reintenta ahí, en vez de pedirle que toque "Actualizar" otra vez
   * sin explicarle por qué.
   */
  private async pedirPermisoInstalacion(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Falta un permiso de Android',
      message: [
        'Android pide autorización para instalar la app. Se concede una sola vez.',
        '',
        'Al continuar vas a ver una pantalla de Ajustes: activá el interruptor y volvé con el botón de atrás.',
        '',
        'La actualización sigue sola desde ahí.',
      ].join('\n'),
      cssClass: 'alerta-respaldo',
      buttons: [
        { text: 'Ahora no', role: 'cancel' },
        {
          text: 'Ir a Ajustes',
          role: 'confirm',
          handler: () => { void this.irAAjustesYReintentar(); },
        },
      ],
    });
    await alert.present();
  }

  private async irAAjustesYReintentar(): Promise<void> {
    const listener = await App.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive) return;

      // Se suelta antes de seguir: si el operador vuelve a salir y entrar
      // mientras corre la descarga, no se dispara una segunda.
      await listener.remove();

      if (await this.actualizacion.puedeInstalar()) {
        await this.doActualizar();
      } else {
        await this.mostrarAlertaRespaldo(
          'El permiso sigue sin estar',
          'No se activó la autorización para instalar.\n\nProbá de nuevo desde "Actualizar la app" en el menú.'
        );
      }
    });

    await this.actualizacion.abrirAjustesInstalacion();
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
