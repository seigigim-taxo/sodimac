import { Injectable, inject, signal } from '@angular/core';
import { RecuperarSesionTrabajoUseCase } from '../../application/conteo/recuperar-sesion-trabajo.use-case';
import { EventoFacade } from '../evento/evento.facade';
import { ZonaFacade } from '../zona/zona.facade';

/*
 * Devuelve al operador donde estaba después de que la app dejó de correr
 * (batería, apagón, kill del SO). Evento, zona, TAG y ubicación viven en
 * signals en memoria y se pierden con el proceso, mientras las líneas contadas
 * quedan en SQLite: esa asimetría dejaba a los guards mandándose entre /home,
 * /counting y /counting-tag sin salida, y el router terminaba cancelando la
 * navegación con el operador varado en el login.
 *
 * Es la única facade que coordina a otras dos. Se hace acá y no en cada página
 * porque la restauración tiene que ocurrir antes de que corra cualquier guard,
 * y ni EventoFacade ni ZonaFacade pueden decidirlo por separado: la sesión de
 * TAG solo tiene sentido junto al evento del que cuelga.
 */
@Injectable({ providedIn: 'root' })
export class SesionTrabajoFacade {
  private recuperar    = inject(RecuperarSesionTrabajoUseCase);
  private eventoFacade = inject(EventoFacade);
  private zonaFacade   = inject(ZonaFacade);

  private restaurandoSignal = signal(false);
  readonly restaurando = this.restaurandoSignal.asReadonly();

  /*
   * No propaga errores: si la restauración falla, la app tiene que arrancar
   * igual y dejar al operador elegir evento a mano. Un throw acá dejaría la
   * pantalla en blanco por un dato que es una comodidad, no un requisito.
   */
  async restaurar(operadorId: number, pdaId: number): Promise<void> {
    this.restaurandoSignal.set(true);
    try {
      const sesion = await this.recuperar.execute(operadorId, pdaId);

      /*
       * Sin nada que restaurar hay que dejar el estado limpio, no intacto: en un
       * cambio de operador sobre la misma PDA, lo que quedó en memoria es del
       * turno anterior y no le corresponde a quien acaba de entrar.
       */
      if (!sesion) {
        this.zonaFacade.reset();
        await this.eventoFacade.limpiarSeleccion();
        return;
      }

      this.eventoFacade.restaurarSeleccion(sesion.evento);

      if (sesion.conteo) {
        const { zona, tag, ubicacionId, ubicacionPrecisa } = sesion.conteo;
        this.zonaFacade.restaurarSesion(zona, tag, ubicacionId, ubicacionPrecisa);
      }
    } catch (err) {
      console.error('[SesionTrabajoFacade] no se pudo restaurar la sesión de trabajo:', err);
    } finally {
      this.restaurandoSignal.set(false);
    }
  }
}
