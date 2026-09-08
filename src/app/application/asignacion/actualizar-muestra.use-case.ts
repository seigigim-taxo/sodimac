import { Injectable, inject } from '@angular/core';
import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';
import { Evento } from '../../domain/evento/models/evento.model';
import { Session } from '../../domain/auth/models/session.model';
import { EvaluarJornadasUseCase, ResultadoJornada } from './evaluar-jornadas.use-case';

export type ResultadoActualizarMuestra =
  /*
   * Con evento seleccionado: el SGO tenía una muestra distinta PARA ESA
   * FECHA y quedó persistida.
   */
  | { estado: 'ACTUALIZADA'; asignacion: AsignacionConteo }
  /*
   * Con evento seleccionado: es la misma muestra que ya había para esa fecha.
   * `resultados` viaja igual (con todas las jornadas de la ventana) porque la
   * otra jornada pudo tener novedad aunque la del evento actual no — ver
   * "POR QUÉ VIAJAN LOS RESULTADOS COMPLETOS" más abajo.
   */
  | { estado: 'SIN_CAMBIOS'; resultados: ResultadoJornada[] }
  /*
   * La búsqueda de la maestra nueva falló — sin red, o el SGO no respondió.
   */
  | { estado: 'ERROR_BUSQUEDA'; mensaje: string }
  /*
   * SIN evento seleccionado: cada jornada de la ventana (hoy, mañana) se
   * evaluó por separado y trae su propio resultado — no hay uno solo que
   * "gane", porque no hay ninguna fecha en particular que el operador haya
   * elegido.
   */
  | { estado: 'VENTANA'; resultados: ResultadoJornada[] };

/*
 * "Volvé a preguntarle al SGO por la muestra de hoy" — a pedido, desde el
 * menú, sin esperar a que el operador termine su jornada.
 *
 * POR QUÉ HACE FALTA
 *
 * El SGO puede reasignarle al operador una muestra distinta en pleno día. Este
 * caso de uso es la misma consulta que trae la preparación al iniciar sesión,
 * pero disparable en cualquier momento.
 *
 * POR QUÉ YA NO CIERRA NADA
 *
 * Antes esta acción cerraba el evento actual antes de preguntar —para no
 * terminar con dos eventos ABIERTOS el mismo día si la respuesta traía una
 * muestra nueva—, y eso exigía además que no quedara ningún TAG en curso ni
 * sin sincronizar (si no, la acción se bloqueaba).
 *
 * Eso dejó de existir: el conteo ya no se "cierra" a nivel de evento —lo que
 * importa es que cada TAG viaje al SGO, no que el operador declare
 * explícitamente "terminé". El evento queda ABIERTO todo el tiempo que haga
 * falta, y las muestras nuevas que aparezcan se agregan a la misma jornada sin
 * que el operador tenga que cerrar nada primero. Por eso ya no hace falta un
 * guardián que bloquee la acción por TAGs pendientes: preguntarle al SGO no
 * toca el TAG en curso ni el evento actual, sólo descarga y persiste.
 *
 * POR QUÉ ES POR JORNADA Y NO UNA SOLA CONSULTA
 *
 * "Actualizar maestra" puede dispararse SIN ningún evento elegido —el
 * operador entra al menú desde Inicio sin haber tocado ninguna tarjeta— y ahí
 * hay hasta DOS jornadas en juego, hoy y mañana, cada una con su propio
 * estado en el SGO. Preguntar "¿hay algo nuevo?" de forma genérica y quedarse
 * con la primera respuesta escondería la otra jornada: si hoy no cambió pero
 * mañana sí, el operador se enteraría recién al día siguiente.
 *
 * Por eso EvaluarJornadasUseCase evalúa cada jornada por separado y siempre
 * se corre entera (ver ese archivo). Lo que cambia según haya o no un evento
 * elegido es solo qué se hace con esos resultados:
 *  - CON evento: se toma el que coincide con la fecha de ESE evento —cada
 *    jornada es independiente, así que actualizar una no debe leer ni tocar
 *    la otra.
 *  - SIN evento: se informan las dos, cada una con su resultado.
 *
 * LO QUE NUNCA HACE
 *
 * Ni traer la muestra nueva manda nada al SGO: es una descarga. Lo único que
 * "envía" datos en esta app es "Enviar pendientes", que este caso de uso ni
 * toca ni necesita tocar.
 *
 * POR QUÉ VIAJAN LOS RESULTADOS COMPLETOS
 *
 * EvaluarJornadasUseCase persiste TODAS las jornadas nuevas de la ventana, no
 * solo la del evento actual (ver ese archivo: "si CUALQUIERA es nueva, se
 * persiste la respuesta completa"). Si el evento actual es SIN_CAMBIOS pero la
 * OTRA jornada sí trajo novedad, esa jornada ya quedó guardada en SQLite —lo
 * único que falta es que la pantalla se entere y refresque la lista de
 * eventos. Por eso SIN_CAMBIOS también lleva `resultados`: sin esto, quien
 * llama no tiene forma de saber que hay un evento nuevo esperando y la
 * tarjeta no aparece hasta que algo más (cambiar de tienda, reiniciar la app)
 * fuerce una recarga.
 */
@Injectable({ providedIn: 'root' })
export class ActualizarMuestraUseCase {
  private evaluarJornadasUC = inject(EvaluarJornadasUseCase);

  async execute(session: Session, eventoActual: Evento | null): Promise<ResultadoActualizarMuestra> {
    let resultados;
    try {
      resultados = await this.evaluarJornadasUC.execute(session);
    } catch (err) {
      /*
       * El mensaje NO reenvía el de la excepción tal cual: acá abajo puede
       * venir cualquier cosa —desde un error de red hasta el nombre de una
       * ronda en la base—, y lo único que le importa al operador es que no
       * se pudo confirmar si hay una maestra nueva.
       */
      return {
        estado: 'ERROR_BUSQUEDA',
        mensaje: 'No se pudo consultar si hay una maestra nueva. Vuelve a intentar desde el menú.',
      };
    }

    /*
     * Sin evento elegido no hay una sola fecha que priorizar: se informan las
     * dos jornadas con su propio resultado y quien orquesta la pantalla
     * decide qué mostrar.
     */
    if (!eventoActual) {
      return { estado: 'VENTANA', resultados };
    }

    /*
     * Con evento elegido, la decisión de qué hacer (navegar, avisar) es sobre
     * ESA fecha únicamente. Pero `resultados` completo viaja igual en
     * SIN_CAMBIOS: la otra jornada pudo cambiar aunque esta no, y quien llama
     * necesita saberlo para refrescar la lista de eventos.
     */
    const fecha = eventoActual.fechaProgramada.slice(0, 10);
    const propio = resultados.find((r) => r.fecha === fecha);

    if (!propio || propio.resultado.tipo === 'SIN_NOVEDAD') {
      return { estado: 'SIN_CAMBIOS', resultados };
    }

    return { estado: 'ACTUALIZADA', asignacion: propio.resultado.asignacion };
  }
}
