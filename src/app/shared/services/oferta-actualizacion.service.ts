import { Injectable, computed, inject, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { AlertController } from '@ionic/angular/standalone';
import { ActualizacionFacade } from '../../state/actualizacion/actualizacion.facade';
import { APP_VERSION } from '../../core/version';

/*
 * Ofrecerle al operador la actualización, y llevarla hasta el instalador.
 *
 * Vive en un servicio y no en una pantalla porque hay DOS entradas —el menú y
 * la franja de Inicio— y lo que viene después de aceptar es delicado: la
 * primera vez Android manda al operador a Ajustes a conceder "instalar apps
 * desconocidas", y al volver hay que retomar la descarga solo. Ese camino
 * escrito dos veces se desincroniza en el primer arreglo que se le haga a uno
 * de los dos.
 *
 * CUÁNDO SE CONSULTA
 *
 * Al terminar la sincronización y cada vez que el operador entra a Inicio. Las
 * dos son momentos seguros: no hay ningún TAG abierto. La app se CIERRA para
 * instalarse, así que ofrecerlo a mitad de un conteo sería ofrecerle perder el
 * hilo de lo que está contando.
 *
 * Deliberadamente NO se consulta al volver del segundo plano: eso pasa con la
 * PDA desbloqueándose en cualquier pantalla, TAG abierto incluido.
 */

/*
 * El operador entra y sale de Inicio muchas veces por turno. Sin esta pausa,
 * cada vuelta sería una consulta al servidor para preguntar lo mismo.
 */
const INTERVALO_CONSULTA_MS = 5 * 60_000;

@Injectable({ providedIn: 'root' })
export class OfertaActualizacionService {
  private actualizacion   = inject(ActualizacionFacade);
  private alertController = inject(AlertController);

  private ultimaConsulta = 0;

  /*
   * La versión que el operador ya despachó con "Ahora no".
   *
   * En memoria y no en disco a propósito: al reiniciar la app vuelve a
   * ofrecerse, y ese es justo un buen momento —está en Inicio, sin nada
   * contado— para que la instale. Persistirla convertiría un "ahora no" en un
   * "nunca".
   */
  private descartadaSignal = signal<number | null>(null);

  readonly buscando    = this.actualizacion.buscando;
  readonly descargando = this.actualizacion.descargando;
  readonly porcentaje  = this.actualizacion.porcentaje;
  readonly disponible  = this.actualizacion.disponible;

  /* ¿Hay algo que mostrarle al operador en la franja de Inicio? */
  readonly ofrecible = computed(() => {
    if (!this.actualizacion.hayActualizacion()) return false;

    /*
     * Con la versión instalada desconocida NO se ofrece nada acá.
     *
     * `instalada` en 0 significa "no se pudo leer del sistema", y para la
     * comparación eso hace que cualquier versión del servidor parezca más
     * nueva. En la consulta del menú da igual —el operador preguntó, y ofrecer
     * sin saber es mejor que no contestar—, pero esta franja se pinta sola: se
     * quedaría puesta para siempre, y una franja que no se va es una que el
     * operador aprende a ignorar, incluida la vez que sí importa.
     */
    if (this.actualizacion.instalada() <= 0) return false;

    const version = this.actualizacion.disponible();
    if (!version) return false;

    // Una versión obligatoria no se puede despachar.
    if (version.obligatoria) return true;

    return version.versionCode !== this.descartadaSignal();
  });

  descartar(): void {
    const version = this.actualizacion.disponible();
    if (version && !version.obligatoria) this.descartadaSignal.set(version.versionCode);
  }

  /*
   * Consulta silenciosa: no abre alertas ni molesta si falla.
   *
   * Un servidor caído o una PDA sin señal no pueden interrumpir a alguien que
   * viene a contar. Si no se pudo averiguar, simplemente no se ofrece nada.
   */
  async buscarEnSilencio(): Promise<void> {
    const ahora = Date.now();
    if (ahora - this.ultimaConsulta < INTERVALO_CONSULTA_MS) return;
    this.ultimaConsulta = ahora;

    await this.actualizacion.buscar();
  }

  /*
   * Consulta pedida desde el menú: acá SÍ se contesta siempre, aunque no haya
   * nada. El operador tocó un botón y se quedó mirando; no decirle nada es
   * dejarlo sin saber si funcionó.
   */
  async buscarYResponder(): Promise<void> {
    if (this.actualizacion.buscando() || this.actualizacion.descargando()) return;

    this.ultimaConsulta = Date.now();
    const hay = await this.actualizacion.buscar();

    if (!hay) {
      const error = this.actualizacion.error();
      await this.avisar(
        error ? 'No se pudo consultar' : 'La app está al día',
        error ?? `Estás usando la última versión disponible (${APP_VERSION}).`
      );
      return;
    }

    await this.ofrecer();
  }

  /*
   * La confirmación antes de instalar. La pide tanto el menú como la franja:
   * la app se va a cerrar sola y el operador tiene que saberlo ANTES, no
   * descubrirlo cuando la pantalla se apague.
   */
  async ofrecer(): Promise<void> {
    const version = this.actualizacion.disponible();
    if (!version) return;

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
        /*
         * Posponer sólo si la versión no es obligatoria. Con obligatoria en
         * true el operador no puede seguir trabajando con una versión que el
         * servidor marcó como no apta.
         */
        ...(version.obligatoria
          ? []
          : [{ text: 'Ahora no', role: 'cancel', handler: () => { this.descartar(); } }]),
        { text: 'Actualizar', role: 'confirm', handler: () => { void this.instalar(); } },
      ],
    });
    await alert.present();
  }

  private async instalar(): Promise<void> {
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
        await this.avisar(
          'La descarga falló',
          'El archivo llegó incompleto, seguramente por la señal.\n\nProbá de nuevo con mejor cobertura.'
        );
        return;

      case 'ERROR':
        await this.avisar('No se pudo actualizar', resultado.mensaje);
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
        await this.instalar();
      } else {
        await this.avisar(
          'El permiso sigue sin estar',
          'No se activó la autorización para instalar.\n\nProbá de nuevo desde "Actualizar la app" en el menú.'
        );
      }
    });

    await this.actualizacion.abrirAjustesInstalacion();
  }

  /*
   * Texto plano con saltos de línea, no HTML: Ionic trae innerHTML
   * deshabilitado en las alertas y abrirlo globalmente por un mensaje no se
   * justifica. La clase alerta-respaldo respeta los \n.
   */
  private async avisar(header: string, message: string): Promise<void> {
    const alert = await this.alertController.create({
      header,
      message,
      cssClass: 'alerta-respaldo',
      buttons: ['Entendido'],
    });
    await alert.present();
  }
}
