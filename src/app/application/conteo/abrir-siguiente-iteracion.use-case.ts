import { Injectable, inject } from '@angular/core';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { PLAN_MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/plan-muestra.repository';

export interface ResultadoAbrirIteracion {
  conteoId:          number;
  iteracion:         number;
  iteracionAnterior: number;
  // false = la ronda se abrió pero no hay muestra que recontar (nada que revisar).
  conMuestra:        boolean;
}

/*
 * Abre la ronda siguiente de un evento que quedó EN_ANALISIS: crea su fila en
 * sod_conteo y pasa el evento a RECONTEO, que es lo que habilita al operador a
 * volver a contar.
 *
 * La ronda se crea ACÁ, vacía, y no al primer escaneo. Es lo que permite
 * distinguir "ronda 2 abierta y sin contar" de "ronda 1 cerrada" — antes la
 * iteración se derivaba de MAX() sobre las líneas, así que el primer conteo de
 * la ronda nueva se registraba con el número de la anterior.
 *
 * `iteracionSgo` queda como punto de entrada para cuando el análisis del SGO
 * devuelva el número.
 */
@Injectable({ providedIn: 'root' })
export class AbrirSiguienteIteracionUseCase {
  private eventoRepo      = inject(EVENTO_REPOSITORY_TOKEN);
  private conteoRepo      = inject(CONTEO_REPOSITORY_TOKEN);
  /*
   * `optional` porque el token no tiene implementación registrada: el SGO no
   * entrega todavía la muestra de las iteraciones de reconteo. Sin esto, la sola
   * construcción de este caso de uso —que ocurre al inyectar EventoFacade en
   * /home— tira NullInjectorError y deja la app sin home.
   * El fallo se difiere a execute(), que es donde de verdad hace falta.
   */
  private planMuestraRepo = inject(PLAN_MUESTRA_REPOSITORY_TOKEN, { optional: true });

  async execute(eventoId: number, iteracionSgo?: number): Promise<ResultadoAbrirIteracion> {
    const evento = await this.eventoRepo.getById(eventoId);
    if (!evento) {
      throw new Error(`No se encontró el evento ${eventoId}`);
    }
    if (evento.estado !== 'EN_ANALISIS') {
      throw new Error('Solo se puede abrir una iteración nueva sobre un evento en análisis.');
    }

    /*
     * Un evento EN_ANALISIS no tiene ronda abierta —la anterior se cerró—, así
     * que el número previo sale de la última ronda registrada. Si no hay
     * ninguna, la ronda actual es la 1.
     */
    const ultima = await this.conteoRepo.getUltimaRonda(eventoId);
    const actual = ultima?.iteracion ?? 1;

    const siguiente = iteracionSgo ?? actual + 1;
    // Una iteración nunca retrocede: si el SGO mandara un número menor o igual,
    // se corta acá antes de reabrir una ronda ya cerrada.
    if (siguiente <= actual) {
      throw new Error(`La iteración ${siguiente} no es posterior a la activa (${actual}).`);
    }

    if (!this.planMuestraRepo) {
      throw new Error(
        'El reconteo no está disponible: falta la descarga de la muestra desde el SGO.'
      );
    }

    const muestraId = await this.planMuestraRepo.prepararMuestraDeIteracion(eventoId, siguiente);

    /*
     * Cerrar la anterior ANTES de abrir la nueva: dos rondas abiertas en el
     * mismo evento harían que "la ronda activa" dependa del orden de la
     * consulta en vez de un hecho. Normalmente ya la cerró
     * FinalizarEventoUseCase; esto cubre los casos en que el evento llegó a
     * EN_ANALISIS por otra vía.
     */
    if (ultima?.estado === 'ABIERTO') {
      await this.conteoRepo.cerrarRonda(ultima.id);
    }

    /*
     * La ronda se crea antes de habilitar el reconteo: si el operador entrara a
     * contar y la ronda no existiera, sus líneas no tendrían de qué colgar.
     */
    const ronda = await this.conteoRepo.abrirRonda(eventoId, siguiente);
    await this.eventoRepo.updateEstado(eventoId, 'RECONTEO');

    return {
      conteoId:          ronda.id,
      iteracion:         ronda.iteracion,
      iteracionAnterior: actual,
      conMuestra:        muestraId !== null,
    };
  }
}
