import { Injectable, inject, isDevMode, signal } from '@angular/core';
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
import { HayTrabajoEnVentanaUseCase } from '../../application/evento/hay-trabajo-en-ventana.use-case';

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
  private hayTrabajoEnVentana = inject(HayTrabajoEnVentanaUseCase);

  private iniciado = false;

  /* El día en que ya se avisó del cierre, para no repetirlo en cada vuelta. */
  private ultimoDiaAvisado: string | null = null;

  /*
   * La fecha de la jornada que se cerró sola al cambiar el día, o null.
   *
   * La lee Inicio para mostrar la franja de aviso. Es un signal y no un toast
   * porque el operador puede tener la PDA en el bolsillo cuando cambia el día:
   * un toast se le pierde y volvería sin entender por qué el evento que tenía
   * elegido ya no está.
   */
  private jornadaCerradaSignal = signal<string | null>(null);
  readonly jornadaCerrada = this.jornadaCerradaSignal.asReadonly();

  /* La cierra el operador al leerla. */
  descartarAvisoJornadaCerrada(): void {
    this.jornadaCerradaSignal.set(null);
  }

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
   * Cambió el día. Hay dos salidas distintas y elegir mal es caro.
   *
   * Antes había una sola: cerrar la sesión. Valía porque la app bajaba un solo
   * día, así que preparación de ayer significaba que no quedaba nada válido.
   *
   * Con la ventana de dos días eso dejó de ser cierto. El operador que preparó
   * ayer también se bajó la jornada de hoy, y mandarlo al login lo obligaría a
   * sincronizar para volver a entrar — o sea a tener señal, que es justo lo que
   * la ventana venía a evitar. Se quedaría afuera con el trabajo del día ya
   * bajado en la PDA.
   *
   * Entonces:
   *  - Si queda trabajo vigente, la jornada de ayer se cierra sola y el
   *    operador sigue. Se limpia el estado de trabajo en memoria, que apunta al
   *    evento y al TAG de ayer, y se le avisa arriba en Inicio.
   *  - Si no queda nada, se cierra la sesión como antes.
   *
   * NO se borra nada de SQLite. Lo de ayer queda en la base como registro; lo
   * único que cambia es que deja de ofrecerse.
   */
  private async revisar(): Promise<void> {
    if (!this.auth.isAuthenticated()) return;

    const hoy = hoySql();
    const ultima = await this.meta.obtener(CLAVE_ULTIMA_PREPARACION);
    if (!debeCerrarSesionPorDia(ultima, hoy)) return;

    /*
     * El aviso se da una vez por día. Sin esto, cada vez que la app vuelve del
     * segundo plano —que puede ser muchas veces en un turno— se limpiaría el
     * estado de trabajo y reaparecería el mismo cartel.
     *
     * No se toca CLAVE_ULTIMA_PREPARACION para lograrlo: esa fecha significa
     * "cuándo se descargó por última vez" y escribirla acá sería mentir. De ahí
     * cuelga la sincronización forzada al entrar, que SÍ tiene que seguir
     * sabiendo que los datos son de ayer.
     */
    if (this.ultimoDiaAvisado === hoy) return;
    this.ultimoDiaAvisado = hoy;

    const operadorId = this.auth.session()?.operadorId;
    const hayTrabajo = operadorId
      ? await this.hayTrabajoEnVentana.execute(operadorId)
      : false;

    if (hayTrabajo) {
      if (isDevMode()) {
        console.log(`[VigenciaDia] los datos son del ${ultima} y hoy es ${hoy}, pero queda jornada vigente: se cierra la de ayer`);
      }

      await this.sesionTrabajo.limpiar();
      this.jornadaCerradaSignal.set(ultima);
      this.router.navigate(['/home']);
      return;
    }

    if (isDevMode()) {
      console.log(`[VigenciaDia] los datos son del ${ultima} y hoy es ${hoy}: se cierra la sesión`);
    }

    await this.sesionTrabajo.limpiar();
    await this.auth.logout();
    this.router.navigate(['/login']);
  }
}
