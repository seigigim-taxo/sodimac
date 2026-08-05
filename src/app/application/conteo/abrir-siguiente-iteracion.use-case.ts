import { Injectable, inject } from '@angular/core';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { PLAN_MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/plan-muestra.repository';

export interface ResultadoAbrirIteracion {
  iteracion:         number;
  iteracionAnterior: number;
  // false = la ronda se abrió pero no hay muestra que recontar (nada que revisar).
  conMuestra:        boolean;
}

/*
 * Abre la ronda siguiente de un evento que quedó EN_ANALISIS: lo pasa a RECONTEO,
 * que es lo que habilita al operador a volver a contar.
 *
 * El NÚMERO de la ronda no se persiste: la iteración vive solo en sod_conteo, y
 * una ronda recién abierta todavía no tiene filas propias. El número que devuelve
 * este caso de uso es informativo (para el mensaje que ve el operador); la fila
 * real se estampa con MAX(iteracion) al primer escaneo.
 *
 * LIMITACIÓN CONOCIDA que se arrastra de ahí: mientras no exista dónde guardar la
 * ronda activa, el primer conteo de la ronda nueva se registra con el número de la
 * anterior. Corregirlo requiere decidir dónde se guarda esa ronda.
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

    const actual    = await this.conteoRepo.getIteracionActiva(eventoId);
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

    await this.eventoRepo.updateEstado(eventoId, 'RECONTEO');

    return {
      iteracion:         siguiente,
      iteracionAnterior: actual,
      conMuestra:        muestraId !== null,
    };
  }
}
