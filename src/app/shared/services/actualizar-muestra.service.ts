import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, LoadingController } from '@ionic/angular/standalone';
import { ActualizarMuestraUseCase } from '../../application/asignacion/actualizar-muestra.use-case';
import { AuthFacade } from '../../state/auth/auth.facade';
import { PdaFacade } from '../../state/pda/pda.facade';
import { EventoFacade } from '../../state/evento/evento.facade';
import { SucursalFacade } from '../../state/sucursal/sucursal.facade';
import { ConteoFacade } from '../../state/conteo/conteo.facade';
import { pararseEnAsignacion } from '../../state/asignacion/pararse-en-asignacion.util';

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
 * QUÉ HACE DESPUÉS DE UN RESULTADO NO BLOQUEADO
 *
 * Si ActualizarMuestraUseCase llegó a cerrar el evento (estaba ABIERTO o
 * RECONTEO), la pantalla en la que el operador esté parado quedó mirando un
 * evento que el SGO ya no reconoce como el actual. Si encima quedó una sesión
 * de TAG en memoria —abierta pero vacía, la única que el guardián deja pasar—
 * esa sesión ahora apunta a una ronda que puede estar cerrada. Por eso, en
 * cualquier resultado que no sea BLOQUEADO, se limpia esa sesión y se navega a
 * Inicio: es la misma limpieza que ya hace "Descartar TAG", aplicada acá
 * porque el cierre no lo disparó el operador tocando ese botón, lo disparó
 * esta acción.
 *
 * Si el resultado es BLOQUEADO, en cambio, no se toca nada: el operador sigue
 * exactamente donde estaba, con su TAG intacto — es lo que el aviso le pide
 * resolver antes de reintentar.
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
  private pda              = inject(PdaFacade);
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
    const pdaId   = this.pda.pdaId();
    if (!session || pdaId === null) {
      await this.avisar('No se pudo actualizar', 'Falta la sesión o la PDA. Vuelve a entrar y prueba de nuevo.');
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
      const resultado = await this.actualizarUC.execute(session, eventoActual, pdaId);
      /*
       * Se saca ANTES de mostrar cualquier aviso: si quedara abajo, en el
       * finally, el aviso terminaría apilado encima del loading en vez de
       * mostrarse solo.
       */
      await loading.dismiss();

      switch (resultado.estado) {
        case 'BLOQUEADO':
          await this.avisar('No se pudo actualizar', resultado.motivo);
          return;

        case 'ACTUALIZADA':
          await pararseEnAsignacion(resultado.asignacion, this.sucursalFacade, this.eventoFacade, session.operadorId);
          await this.limpiarContextoDeConteo();
          await this.avisar('Maestra actualizada', `Ahora estás trabajando con: ${resultado.asignacion.nombre}`);
          return;

        case 'SIN_CAMBIOS':
          /*
           * Si había un evento y seguía abierto, ActualizarMuestraUseCase ya lo
           * cerró aunque la muestra no haya cambiado — el operador pidió cerrar
           * y volver a preguntar, y eso se cumplió igual. Sin refrescar acá, la
           * lista de eventos seguiría mostrándolo como ABIERTO.
           */
          if (eventoActual) {
            await this.eventoFacade.limpiarSeleccion();
            await this.eventoFacade.loadEventos(eventoActual.sucursalId);
          }
          await this.limpiarContextoDeConteo();
          await this.avisar('Ya tienes la maestra vigente', 'El SGO no tiene una maestra distinta a la que ya tienes.');
          return;

        case 'ERROR_BUSQUEDA':
          /*
           * El cierre (si hacía falta) ya pasó — mismo refresco que SIN_CAMBIOS,
           * por la misma razón: sin esto la lista seguiría mostrando ABIERTO un
           * evento que la base ya tiene como EN_ANALISIS.
           */
          if (eventoActual) {
            await this.eventoFacade.limpiarSeleccion();
            await this.eventoFacade.loadEventos(eventoActual.sucursalId);
          }
          await this.limpiarContextoDeConteo();
          await this.avisar('No se pudo actualizar', resultado.mensaje);
          return;
      }
    } catch (err) {
      await loading.dismiss();
      await this.avisar('No se pudo actualizar', err instanceof Error ? err.message : 'Error al consultar al SGO.');
    } finally {
      this.actualizandoSignal.set(false);
    }
  }

  private async limpiarContextoDeConteo(): Promise<void> {
    if (this.conteo.enCurso()) this.conteo.reset();
    await this.router.navigate(['/home']);
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
