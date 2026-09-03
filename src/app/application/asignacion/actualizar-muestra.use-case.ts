import { Injectable, inject } from '@angular/core';
import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';
import { Evento } from '../../domain/evento/models/evento.model';
import { Session } from '../../domain/auth/models/session.model';
import { FinalizarEventoUseCase } from '../conteo/finalizar-evento.use-case';
import { BuscarNuevoConteoUseCase } from './buscar-nuevo-conteo.use-case';

export type ResultadoActualizarMuestra =
  /** Hay un TAG en curso o sin sincronizar. El mensaje ya viene armado. */
  | { estado: 'BLOQUEADO'; motivo: string }
  /** El SGO tenía una muestra distinta y quedó persistida. */
  | { estado: 'ACTUALIZADA'; asignacion: AsignacionConteo }
  /** Se consultó al SGO y es la misma muestra que ya había. */
  | { estado: 'SIN_CAMBIOS' };

/*
 * "Volvé a preguntarle al SGO por la muestra de hoy" — a pedido, desde el
 * menú, sin esperar a que el operador termine su jornada.
 *
 * POR QUÉ HACE FALTA
 *
 * El SGO puede reasignarle al operador una muestra distinta en pleno día. Hoy
 * la única forma de que la PDA se entere es terminando el conteo en curso: la
 * consulta a preparación sólo se ofrece cuando no queda nada abierto. Este caso
 * de uso es esa misma consulta, pero disparable en cualquier momento.
 *
 * POR QUÉ SE CIERRA EL EVENTO ANTES DE PREGUNTAR
 *
 * Preguntarle al SGO no manda nada — sólo descarga y persiste. Pero si la
 * respuesta trae un código de muestra nuevo, SincronizarDatosInicialesUseCase
 * puede terminar creando un evento distinto (ver BuscarNuevoConteoUseCase). Si
 * el de ahora se queda ABIERTO, la PDA termina con dos eventos abiertos el
 * mismo día — el viejo, sin declararlo nunca terminado, y el nuevo. Cerrarlo
 * antes dijo la 8.31 "solo para finalizar bien el proceso": es dejar la casa
 * ordenada antes de traer la muestra nueva, no un requisito técnico de la
 * descarga en sí.
 *
 * POR QUÉ EL GUARDIÁN ES FinalizarEventoUseCase Y NO UNO PROPIO
 *
 * Ese caso de uso ya exige exactamente lo que hace falta acá: cero TAGs
 * EN_CURSO y cero FINALIZADO sin sincronizar. Un TAG que el operador abrió pero
 * todavía no escaneó nada no dejó fila en sod_conteo_detalle —esas filas se
 * crean recién con el primer scan (ver IniciarSesionConteoUseCase)— así que ni
 * siquiera aparece en esa consulta: queda descartado solo, sin necesidad de un
 * caso especial para "TAG vacío".
 *
 * Reusarlo entero, en vez de escribir una consulta paralela, evita que las dos
 * definiciones de "¿se puede cerrar esto?" se desalineen con el tiempo. Los
 * mensajes de bloqueo también son los que ese caso de uso ya redacta —no se
 * inventa texto nuevo acá.
 *
 * LO QUE NUNCA HACE
 *
 * Ni cerrar el evento ni traer la muestra nueva mandan algo al SGO: el primero
 * es una transición de estado local (ABIERTO → EN_ANALISIS) y el segundo es una
 * descarga. Lo único que "envía" datos en esta app es "Enviar pendientes", que
 * este caso de uso ni toca ni necesita tocar.
 */
@Injectable({ providedIn: 'root' })
export class ActualizarMuestraUseCase {
  private finalizarUC = inject(FinalizarEventoUseCase);
  private buscarUC    = inject(BuscarNuevoConteoUseCase);

  async execute(
    session: Session,
    eventoActual: Evento | null,
    pdaId: number
  ): Promise<ResultadoActualizarMuestra> {
    if (eventoActual && this.sigueAbierto(eventoActual)) {
      try {
        await this.finalizarUC.execute(eventoActual.id, session.operadorId, pdaId);
      } catch (err) {
        return {
          estado: 'BLOQUEADO',
          motivo: err instanceof Error ? err.message : 'No se pudo cerrar el conteo en curso.',
        };
      }
    }

    const asignacion = await this.buscarUC.execute(session);

    return asignacion ? { estado: 'ACTUALIZADA', asignacion } : { estado: 'SIN_CAMBIOS' };
  }

  /*
   * ABIERTO y RECONTEO son los dos estados en los que FinalizarEventoUseCase
   * todavía tiene algo que hacer. CERRADO y EN_ANALISIS ya están, en los
   * hechos, terminados: no hace falta volver a intentarlo, y evitarlo acá deja
   * de depender de leer el texto de la excepción que ese caso de uso lanzaría
   * para "ya está finalizado".
   */
  private sigueAbierto(evento: Evento): boolean {
    return evento.estado !== 'CERRADO' && evento.estado !== 'EN_ANALISIS';
  }
}
