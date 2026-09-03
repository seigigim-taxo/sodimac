import { Injectable, inject } from '@angular/core';
import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';
import { Evento } from '../../domain/evento/models/evento.model';
import { Session } from '../../domain/auth/models/session.model';
import { FinalizarEventoUseCase } from '../conteo/finalizar-evento.use-case';
import { BuscarOReabrirConteoUseCase } from './buscar-o-reabrir-conteo.use-case';

export type ResultadoActualizarMuestra =
  /** Hay un TAG en curso o sin sincronizar. El mensaje ya viene armado. */
  | { estado: 'BLOQUEADO'; motivo: string }
  /*
   * El SGO tenía una muestra distinta y quedó persistida, O el código
   * coincidía con el evento que este mismo flujo acaba de cerrar y se
   * deshizo ese cierre. Para el operador el resultado práctico es el mismo:
   * hay un evento ABIERTO con el que seguir — no se distingue acá cuál de
   * los dos pasó (ver BuscarOReabrirConteoUseCase para esa distinción).
   */
  | { estado: 'ACTUALIZADA'; asignacion: AsignacionConteo }
  /** Se consultó al SGO y es la misma muestra que ya había, sin nada que reabrir. */
  | { estado: 'SIN_CAMBIOS' }
  /*
   * El cierre (si hacía falta) salió bien, pero la búsqueda de la maestra
   * nueva falló — sin red, o el SGO no respondió. Es un resultado distinto
   * de BLOQUEADO: acá el evento SÍ se tocó, y el operador se queda sin
   * saber si hay maestra nueva o no, no sin haber tocado nada.
   */
  | { estado: 'ERROR_BUSQUEDA'; mensaje: string };

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
 * POR QUÉ TAMBIÉN PUEDE REABRIR
 *
 * Si el cierre de acá arriba era prematuro —el SGO todavía no tiene nada
 * distinto y le devuelve el mismo codigo_muestra del evento que se acaba de
 * cerrar—, dejarlo en EN_ANALISIS sin más lo varaba: SIN_CAMBIOS le decía "ya
 * tenés la muestra vigente" con el evento cerrado y ningún camino local para
 * retomarlo. Por eso se llama a BuscarOReabrirConteoUseCase —el mismo
 * orquestador que usa el botón "Actualizar" de Home— en vez de a
 * BuscarNuevoConteoUseCase directo: la decisión de "¿corresponde reabrir?" es
 * una sola y vive ahí, no se vuelve a escribir acá.
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
  private finalizarUC        = inject(FinalizarEventoUseCase);
  private buscarOReabrirUC   = inject(BuscarOReabrirConteoUseCase);

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

    let resultado;
    try {
      resultado = await this.buscarOReabrirUC.execute(session);
    } catch (err) {
      /*
       * El mensaje NO reenvía el de la excepción tal cual: acá abajo puede
       * venir cualquier cosa —desde un error de red hasta el nombre de una
       * ronda en la base—, y lo único que le importa al operador es que no
       * se pudo confirmar si hay una maestra nueva. Distinto de BLOQUEADO:
       * el cierre de arriba, si hacía falta, ya se hizo.
       */
      return {
        estado: 'ERROR_BUSQUEDA',
        mensaje: 'No se pudo consultar si hay una maestra nueva. Vuelve a intentar desde el menú.',
      };
    }

    return resultado.tipo === 'SIN_NOVEDAD'
      ? { estado: 'SIN_CAMBIOS' }
      : { estado: 'ACTUALIZADA', asignacion: resultado.asignacion };
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
