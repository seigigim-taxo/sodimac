import { Injectable, inject, isDevMode } from '@angular/core';
import { App } from '@capacitor/app';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular/standalone';
import { AuthFacade } from '../../state/auth/auth.facade';
import { SesionTrabajoFacade } from '../../state/sesion-trabajo/sesion-trabajo.facade';
import { EnviarPendientesFacade } from '../../state/sincronizacion/enviar-pendientes.facade';
import { SINCRONIZACION_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import {
  CLAVE_ULTIMA_PREPARACION,
  META_REPOSITORY_TOKEN,
} from '../../domain/meta/repositories/meta.repository';
import { debeCerrarSesionPorDia, necesitaPreparar } from '../../domain/meta/utils/vigencia-dia.utils';
import { hoySql } from '../utils/fecha.utils';

/*
 * Vigila que la jornada de la app coincida con el día real.
 *
 * El caso que resuelve: el operador no cierra sesión, solo bloquea la PDA y se
 * va. Al día siguiente la desbloquea y sigue trabajando sobre los datos de
 * ayer — que fue exactamente como terminó enviándose un conteo contra la agenda
 * del día anterior, porque el equipo seguía parado en ese evento.
 *
 * Se engancha a la vuelta del segundo plano y no a un temporizador: el cambio
 * de día ocurre mientras la app está dormida, y despertar el proceso cada
 * minuto para mirar un reloj sería gastar batería en piso de tienda.
 */
@Injectable({ providedIn: 'root' })
export class VigenciaDiaService {
  private meta             = inject(META_REPOSITORY_TOKEN);
  private auth             = inject(AuthFacade);
  private sesionTrabajo    = inject(SesionTrabajoFacade);
  private router           = inject(Router);
  private sincronizacion   = inject(SINCRONIZACION_REPOSITORY_TOKEN);
  private enviarPendientes = inject(EnviarPendientesFacade);
  private alertController  = inject(AlertController);

  private iniciado = false;

  iniciar(): void {
    if (this.iniciado) return;
    this.iniciado = true;

    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void this.revisar();
    });
  }

  /*
   * Los datos que tiene la PDA, ¿son de hoy? Lo usa el login para decidir si
   * puede entrar directo o tiene que pasar por la descarga.
   */
  async necesitaSincronizar(): Promise<boolean> {
    const ultima = await this.meta.obtener(CLAVE_ULTIMA_PREPARACION);
    return necesitaPreparar(ultima, hoySql());
  }

  /*
   * Cerrar la sesión es más agresivo que sincronizar, así que solo ocurre
   * cuando SE SABE que los datos son de otro día — ver debeCerrarSesionPorDia.
   *
   * Se limpia también el estado de trabajo en memoria: quedaría apuntando al
   * evento y al TAG de ayer, y el próximo operador los heredaría.
   */
  private async revisar(): Promise<void> {
    if (!this.auth.isAuthenticated()) return;

    const ultima = await this.meta.obtener(CLAVE_ULTIMA_PREPARACION);
    if (!debeCerrarSesionPorDia(ultima, hoySql())) return;

    if (isDevMode()) {
      console.log(`[VigenciaDia] los datos son del ${ultima} y hoy es ${hoySql()}: se cierra la sesión`);
    }

    await this.avisarPendientes();

    await this.sesionTrabajo.limpiar();
    await this.auth.logout();
    this.router.navigate(['/login']);
  }

  /*
   * Última oportunidad de subir lo que quedó del día anterior.
   *
   * El cierre de sesión no pierde nada —las líneas siguen en la base—, pero al
   * volver a entrar la app ya está en el evento de hoy y esos TAGs dejan de
   * estar a la vista. Este es el único momento en que el operador se entera.
   *
   * Se cuenta desde la misma fuente que después envía (sod_sincronizacion), no
   * desde los resúmenes: si contáramos de un lado y enviáramos del otro, el
   * número del aviso podría no coincidir con lo que realmente se manda.
   */
  private async avisarPendientes(): Promise<void> {
    let pendientes = 0;
    try {
      pendientes = (await this.sincronizacion.listarPendientes()).length;
    } catch (err) {
      // No poder contarlos no es motivo para dejar la sesión de ayer abierta.
      console.error('[VigenciaDia] no se pudieron consultar los pendientes:', err);
      return;
    }
    if (pendientes === 0) return;

    if (!(await this.preguntarSiEnvia(pendientes))) return;

    try {
      const resultado = await this.enviarPendientes.enviar();
      await this.informar(
        resultado.conError === 0
          ? `Se enviaron ${resultado.enviados} TAG(s).`
          : `Se enviaron ${resultado.enviados} de ${resultado.total}. ${resultado.conError} quedaron pendientes.`
      );
    } catch {
      await this.informar('No se pudieron enviar. Quedan guardados en el equipo para el próximo intento.');
    }
  }

  private preguntarSiEnvia(pendientes: number): Promise<boolean> {
    const cuantos = pendientes === 1 ? '1 TAG' : `${pendientes} TAGs`;
    return new Promise((resolve) => {
      this.alertController.create({
        header: 'Cambió el día',
        message:
          `Quedaron ${cuantos} sin enviar al servidor. Se va a cerrar la sesión: ` +
          `los conteos no se pierden, pero después no vas a verlos en pantalla.`,
        backdropDismiss: false,
        buttons: [
          { text: 'Cerrar sesión', role: 'cancel', handler: () => resolve(false) },
          { text: 'Enviar ahora', role: 'confirm', handler: () => resolve(true) },
        ],
      }).then((alert) => {
        // Sin esto, cerrar el alert por fuera dejaría la promesa colgada y el
        // cierre de sesión no llegaría a ocurrir nunca.
        void alert.onDidDismiss().then(() => resolve(false));
        return alert.present();
      });
    });
  }

  private informar(message: string): Promise<void> {
    return new Promise((resolve) => {
      this.alertController.create({
        header: 'Envío de pendientes',
        message,
        buttons: [{ text: 'Entendido', handler: () => resolve() }],
      }).then((alert) => {
        void alert.onDidDismiss().then(() => resolve());
        return alert.present();
      });
    });
  }
}
