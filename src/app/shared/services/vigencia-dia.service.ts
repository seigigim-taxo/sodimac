import { Injectable, inject, isDevMode } from '@angular/core';
import { App } from '@capacitor/app';
import { Router } from '@angular/router';
import { AuthFacade } from '../../state/auth/auth.facade';
import { SesionTrabajoFacade } from '../../state/sesion-trabajo/sesion-trabajo.facade';
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
 *
 * NO avisa de los TAGs sin enviar antes de cerrar, y es a propósito: un conteo
 * que no alcanzó a subir en su jornada se da por perdido y no se manda después
 * (ver listarPendientes en el repositorio de sincronización). Ofrecer subirlos
 * acá sería prometer algo que el envío ya no permite.
 */
@Injectable({ providedIn: 'root' })
export class VigenciaDiaService {
  private meta             = inject(META_REPOSITORY_TOKEN);
  private auth             = inject(AuthFacade);
  private sesionTrabajo    = inject(SesionTrabajoFacade);
  private router           = inject(Router);

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

    await this.sesionTrabajo.limpiar();
    await this.auth.logout();
    this.router.navigate(['/login']);
  }
}
