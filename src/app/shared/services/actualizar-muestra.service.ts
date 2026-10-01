import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, LoadingController } from '@ionic/angular/standalone';
import { ActualizarMuestraUseCase } from '../../application/asignacion/actualizar-muestra.use-case';
import { ResultadoJornada } from '../../application/asignacion/evaluar-jornadas.use-case';
import { AuthFacade } from '../../state/auth/auth.facade';
import { EventoFacade } from '../../state/evento/evento.facade';
import { SucursalFacade } from '../../state/sucursal/sucursal.facade';
import { ConteoFacade } from '../../state/conteo/conteo.facade';
import { pararseEnAsignacion, pararseEnSucursal } from '../../state/asignacion/pararse-en-asignacion.util';
import { TiendaVigente } from '../../application/sucursal/actualizar-tienda-operador.use-case';
import { hoySql, manianaSql } from '../utils/fecha.utils';

/*
 * "Actualizar muestra" desde el menú lateral: volver a preguntarle al SGO por
 * la muestra de hoy sin esperar a que termine la jornada.
 *
 * Vive en un servicio y no en una pantalla porque se dispara desde el menú,
 * que está disponible en cualquier lugar de la app — a diferencia de
 * "buscarNuevoConteo", que sólo vive en Home porque ahí es donde tiene
 * sentido ofrecerlo. Acá el operador puede estar en Conteos, en medio de la
 * pantalla de TAG, o en Inicio: la lógica no puede asumir dónde está parado.
 *
 * QUÉ HACE DESPUÉS DE CADA RESULTADO
 *
 * El conteo ya no se cierra a nivel de evento, así que esta acción no toca ni
 * el evento actual ni el TAG en curso del operador — solo descarga y, si hay
 * novedad, persiste. Por eso solo navega a Inicio y limpia el contexto de
 * conteo cuando SÍ apareció algo nuevo PARA EL EVENTO ACTUAL (ACTUALIZADA, o
 * VENTANA con alguna jornada nueva): ahí sí conviene pararse en la asignación
 * nueva y mostrar Home con la tienda correcta. Cuando el evento actual queda
 * sin novedad (SIN_CAMBIOS, ERROR_BUSQUEDA, o VENTANA sin nada nuevo), el
 * operador sigue exactamente donde estaba — no hay nada que invalide la
 * pantalla en la que se encuentra.
 *
 * La excepción es SIN_CAMBIOS con novedad en la OTRA jornada de la ventana:
 * ahí sí se refresca la lista de eventos (misma tienda, sin navegar) para que
 * esa jornada nueva no quede invisible hasta el próximo reinicio — ver el
 * caso SIN_CAMBIOS más abajo.
 *
 * POR QUÉ HAY UN LOADING DE PANTALLA COMPLETA
 *
 * El botón vive en <ion-menu-toggle>: tocarlo cierra el menú al instante, así
 * que el spinner inline del propio ítem del menú no llega a verse nunca — el
 * operador toca, el menú se cierra, y no hay ninguna señal de que algo esté
 * pasando hasta que aparece el aviso final. El loading cubre esa ventana.
 */
@Injectable({ providedIn: 'root' })
export class ActualizarMuestraService {
  private actualizarUC    = inject(ActualizarMuestraUseCase);
  private auth             = inject(AuthFacade);
  private eventoFacade     = inject(EventoFacade);
  private sucursalFacade   = inject(SucursalFacade);
  private conteo           = inject(ConteoFacade);
  private router           = inject(Router);
  private alertController = inject(AlertController);
  private loadingController = inject(LoadingController);

  private actualizandoSignal = signal(false);
  readonly actualizando = this.actualizandoSignal.asReadonly();

  async actualizar(): Promise<void> {
    if (this.actualizandoSignal()) return;

    const session = this.auth.session();
    if (!session) {
      await this.avisar('No se pudo actualizar', 'Falta la sesión. Vuelve a entrar y prueba de nuevo.');
      return;
    }

    this.actualizandoSignal.set(true);
    const loading = await this.loadingController.create({
      message: 'Consultando al SGO…',
      spinner: 'crescent',
    });
    await loading.present();
    try {
      const eventoActual = this.eventoFacade.selectedEvent();
      const resultado = await this.actualizarUC.execute(session, eventoActual);
      /*
       * Se saca ANTES de mostrar cualquier aviso: si quedara abajo, en el
       * finally, el aviso terminaría apilado encima del loading en vez de
       * mostrarse solo.
       */
      await loading.dismiss();

      switch (resultado.estado) {
        case 'ACTUALIZADA':
          await pararseEnAsignacion(resultado.asignacion, this.sucursalFacade, this.eventoFacade, session.operadorId);
          await this.limpiarContextoDeConteo();
          await this.avisar('Maestra actualizada', `Ahora estás trabajando con: ${resultado.asignacion.nombre}`);
          return;

        /*
         * "Sin cambios" es sobre el evento actual, pero EvaluarJornadasUseCase
         * evalúa (y persiste) TODA la ventana: si la otra jornada sí trajo
         * novedad, ya quedó guardada en SQLite aunque esta rama no lo diga.
         * Sin refrescar acá, esa jornada no aparece en Home hasta que algo
         * más fuerce una recarga (cambiar de tienda, reiniciar la app).
         *
         * La otra jornada puede ser de la MISMA tienda (otro día) o de OTRA
         * tienda — al operador se lo reasignan por jornada, no por local. Si
         * es otra tienda, no alcanza con recargar la lista de eventos: hay
         * que pararse ahí igual que en ACTUALIZADA/VENTANA, porque
         * eventoActual.sucursalId sigue siendo la tienda vieja y el operador
         * nunca vería la tarjeta nueva (el mismo bug que describe el
         * comentario de AsignacionConteo.sucursalId, acá sin cubrir).
         */
        case 'SIN_CAMBIOS': {
          const fecha = eventoActual?.fechaProgramada.slice(0, 10);
          const otraConNovedad = resultado.resultados.find(
            (r) => r.fecha !== fecha && r.resultado.tipo === 'NUEVO'
          );

          if (otraConNovedad && otraConNovedad.resultado.tipo === 'NUEVO') {
            const asignacion = otraConNovedad.resultado.asignacion;

            if (!eventoActual || asignacion.sucursalId !== eventoActual.sucursalId) {
              await pararseEnAsignacion(asignacion, this.sucursalFacade, this.eventoFacade, session.operadorId);
              await this.limpiarContextoDeConteo();
              await this.avisar('Maestra actualizada', this.describirVentana(resultado.resultados));
              return;
            }

            /*
             * Misma tienda, otro día: el evento actual no cambió, así que el
             * operador sigue exactamente donde estaba — solo se refresca la
             * lista para que la tarjeta nueva quede disponible al volver a
             * Inicio.
             */
            await this.eventoFacade.loadEventos(eventoActual.sucursalId);
            await this.avisar('Ya tienes la maestra vigente', this.describirVentana(resultado.resultados));
            return;
          }

          if (await this.pararseSiCambioTienda(resultado.tiendaVigente, session.operadorId)) return;

          await this.avisar('Ya tienes la maestra vigente', 'El SGO no tiene una maestra distinta a la que ya tienes.');
          return;
        }

        case 'ERROR_BUSQUEDA':
          await this.avisar('No se pudo actualizar', resultado.mensaje);
          return;

        /*
         * Sin evento elegido: hoy y mañana se evaluaron por separado y cada
         * una trae su propio resultado — no hay una sola asignación que
         * "ganó", así que el aviso lista las dos.
         *
         * Si CUALQUIERA de las dos tuvo novedad, la pantalla se para en esa
         * asignación (hoy antes que mañana, mismo criterio que el resto de la
         * app) para que Home quede mostrando la tienda y los eventos
         * correctos. Si las dos están sin novedad, no se navega a ningún lado.
         */
        case 'VENTANA': {
          const conNovedad = resultado.resultados.find((r) => r.resultado.tipo === 'NUEVO');
          if (conNovedad && conNovedad.resultado.tipo === 'NUEVO') {
            await pararseEnAsignacion(conNovedad.resultado.asignacion, this.sucursalFacade, this.eventoFacade, session.operadorId);
            await this.limpiarContextoDeConteo();
            await this.avisar('Maestra actualizada', this.describirVentana(resultado.resultados));
            return;
          }

          if (await this.pararseSiCambioTienda(resultado.tiendaVigente, session.operadorId)) return;

          await this.avisar('Ya tienes la maestra vigente', this.describirVentana(resultado.resultados));
          return;
        }
      }
    } catch (err) {
      await loading.dismiss();
      await this.avisar('No se pudo actualizar', err instanceof Error ? err.message : 'Error al consultar al SGO.');
    } finally {
      this.actualizandoSignal.set(false);
    }
  }

  /*
   * Reasignación de tienda SIN jornada todavía armada: el SGO puede mover al
   * operador a otro local antes de que exista ninguna muestra ahí, y nada de
   * lo de arriba lo detecta porque compara jornadas, no tiendas. Esto cubre
   * ese caso comparando contra la tienda que la pantalla tiene seleccionada
   * ahora mismo — ver ActualizarTiendaOperadorUseCase.
   *
   * Devuelve true cuando efectivamente hubo que pararse en otra tienda (y ya
   * avisó y navegó), para que el llamador sepa que no debe mostrar además el
   * aviso genérico de "sin cambios".
   */
  private async pararseSiCambioTienda(tiendaVigente: TiendaVigente | null, operadorId: number): Promise<boolean> {
    if (!tiendaVigente) return false;

    const actual = this.sucursalFacade.currentStore();
    if (actual && actual.id === tiendaVigente.sucursalId) return false;

    await pararseEnSucursal(tiendaVigente.sucursalId, this.sucursalFacade, this.eventoFacade, operadorId);
    await this.limpiarContextoDeConteo();
    await this.avisar('Tienda actualizada', `Ahora estás trabajando en: ${tiendaVigente.nombreTienda}`);
    return true;
  }

  private async limpiarContextoDeConteo(): Promise<void> {
    if (this.conteo.enCurso()) this.conteo.reset();
    await this.router.navigate(['/home']);
  }

  /*
   * Arma el mensaje del caso VENTANA: una línea por jornada, "Hoy"/"Mañana"
   * antes de la fecha por el mismo motivo que la tarjeta de Home —comparar dos
   * fechas casi idénticas en la pantalla chica de una PDA es donde se lee mal.
   * Fuera de esa ventana (no debería pasar, pero por las dudas) se muestra la
   * fecha cruda en vez de inventar una etiqueta.
   */
  private describirVentana(resultados: ResultadoJornada[]): string {
    if (resultados.length === 0) {
      return 'No hay jornadas asignadas para hoy ni para mañana.';
    }

    const etiqueta = (fecha: string): string => {
      if (fecha === hoySql()) return 'Hoy';
      if (fecha === manianaSql()) return 'Mañana';
      return fecha;
    };

    const linea = ({ fecha, resultado }: ResultadoJornada): string =>
      resultado.tipo === 'NUEVO'
        ? `${etiqueta(fecha)}: jornada nueva — ${resultado.asignacion.nombre}.`
        : `${etiqueta(fecha)}: sin cambios.`;

    return resultados.map(linea).join(' ');
  }

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
