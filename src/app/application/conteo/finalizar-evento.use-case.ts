import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra.repository';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra-detalle.repository';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';
import { Evento } from '../../domain/evento/models/evento.model';

export interface ResultadoFinalizarEvento {
  estado:       Evento['estado'];
  totalMuestra: number;
  contados:     number;
}

@Injectable({ providedIn: 'root' })
export class FinalizarEventoUseCase {
  private conteoRepo  = inject(CONTEO_REPOSITORY_TOKEN);
  private muestraRepo = inject(MUESTRA_REPOSITORY_TOKEN);
  private detalleRepo = inject(MUESTRA_DETALLE_REPOSITORY_TOKEN);
  private eventoRepo  = inject(EVENTO_REPOSITORY_TOKEN);

  /*
   * Cierra el conteo a nivel de evento (no de un TAG puntual) y lo deja SIEMPRE
   * en EN_ANALISIS.
   *
   * La app no evalúa si el conteo estuvo completo: eso lo decide el SGO, que
   * analiza las diferencias y determina si el evento se cierra o si hay una
   * iteración más. Acá solo se declara "terminé de contar" — comparar contra la
   * muestra sería adelantarse a una decisión que no es de la PDA.
   *
   * Los totales que devuelve son informativos, para el mensaje al operador.
   */
  async execute(eventoId: number, operadorId: number, pdaId: number): Promise<ResultadoFinalizarEvento> {
    // Cerrar dos veces el mismo conteo volvería a mover el estado del evento y
    // pisaría el resultado del cierre anterior. Se corta acá, no solo en la UI.
    const evento = await this.eventoRepo.getById(eventoId);
    if (evento && (evento.estado === 'CERRADO' || evento.estado === 'EN_ANALISIS')) {
      throw new Error('El conteo de este evento ya está finalizado.');
    }

    /*
     * Nada puede quedar sin viajar al SGO.
     *
     * Los dos estados pendientes se informan por separado porque el operador
     * tiene que hacer cosas distintas: un TAG EN_CURSO lo termina de contar, uno
     * FINALIZADO ya está contado y lo que falta es subirlo. Un mensaje único lo
     * dejaría buscando qué hacer.
     *
     * Lo de sincronizar es lo que faltaba: hasta acá solo se miraba EN_CURSO, y
     * un TAG contado y cerrado pero nunca enviado pasaba de largo — el conteo
     * quedaba cerrado en la PDA con trabajo que el SGO nunca recibió.
     */
    const resumenes = await this.conteoRepo.getResumenes(operadorId, pdaId);
    const delEvento = resumenes.filter((r) => r.eventoId === eventoId);

    const enCurso = delEvento.filter((r) => r.estado === 'EN_CURSO').length;
    if (enCurso > 0) {
      throw new Error(
        `Aún ${enCurso === 1 ? 'queda 1 TAG en curso' : `quedan ${enCurso} TAGs en curso`} — finalízalos antes de cerrar el conteo del evento.`
      );
    }

    const sinSincronizar = delEvento.filter((r) => r.estado === 'FINALIZADO').length;
    if (sinSincronizar > 0) {
      throw new Error(
        `${sinSincronizar === 1 ? 'Hay 1 TAG sin sincronizar' : `Hay ${sinSincronizar} TAGs sin sincronizar`} — súbelos antes de cerrar el conteo del evento.`
      );
    }

    const ronda     = await this.conteoRepo.getRondaAbierta(eventoId);
    const iteracion = ronda?.iteracion ?? 1;

    const muestra      = await this.muestraRepo.getByEventoIteracion(eventoId, iteracion);
    const totalMuestra = muestra ? (await this.detalleRepo.getByMuestra(muestra.id)).length : 0;
    const skusContados = await this.conteoRepo.getSkusContadosPorEvento(eventoId, operadorId, pdaId);
    const estado: Evento['estado'] = 'EN_ANALISIS';

    if (ronda) {
      await this.conteoRepo.cerrarRonda(ronda.id);
    }

    await this.eventoRepo.updateEstado(eventoId, estado);

    return { estado, totalMuestra, contados: skusContados.length };
  }
}
