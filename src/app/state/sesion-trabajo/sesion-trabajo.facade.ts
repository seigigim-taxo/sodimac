import { Injectable, inject, signal } from '@angular/core';
import { RecuperarSesionTrabajoUseCase } from '../../application/conteo/recuperar-sesion-trabajo.use-case';
import { EventoFacade } from '../evento/evento.facade';
import { ZonaFacade } from '../zona/zona.facade';
import { ConteoFacade } from '../conteo/conteo.facade';
import { ConteoListFacade } from '../conteo/conteo-list.facade';
import { ResumenEventoFacade } from '../conteo/resumen-evento.facade';
import { SucursalFacade } from '../sucursal/sucursal.facade';

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
  private recuperar     = inject(RecuperarSesionTrabajoUseCase);
  private eventoFacade  = inject(EventoFacade);
  private zonaFacade    = inject(ZonaFacade);
  private conteoFacade  = inject(ConteoFacade);
  private conteoList    = inject(ConteoListFacade);
  private resumenFacade = inject(ResumenEventoFacade);
  private sucursalFacade = inject(SucursalFacade);

  private restaurandoSignal = signal(false);
  readonly restaurando = this.restaurandoSignal.asReadonly();

  /*
   * Suelta TODO el estado de trabajo que vive en memoria. Se llama al cerrar
   * sesión: las señales son singletons y sobreviven al logout, así que sin esto
   * el evento, el TAG, los ítems y los conteos del turno anterior siguen ahí
   * para quien entre después. Lo contado no se toca — eso está en SQLite y
   * pertenece al evento, no a la sesión.
   */
  async limpiar(): Promise<void> {
    this.conteoFacade.reset();
    this.zonaFacade.reset();
    this.conteoList.reset();
    this.resumenFacade.reset();
    this.sucursalFacade.reset();
    await this.eventoFacade.limpiarSeleccion();
  }

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
        await this.limpiar();
        return;
      }

      /*
       * La sesión de conteo en memoria es del turno anterior aunque el evento
       * coincida: sus ids de conteo y operador ya no valen. La pantalla de
       * conteo la vuelve a abrir en su ionViewWillEnter.
       */
      this.conteoFacade.reset();

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
