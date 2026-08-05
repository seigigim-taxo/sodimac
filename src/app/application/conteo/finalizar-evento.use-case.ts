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
  faltantes:    number;
}

@Injectable({ providedIn: 'root' })
export class FinalizarEventoUseCase {
  private conteoRepo  = inject(CONTEO_REPOSITORY_TOKEN);
  private muestraRepo = inject(MUESTRA_REPOSITORY_TOKEN);
  private detalleRepo = inject(MUESTRA_DETALLE_REPOSITORY_TOKEN);
  private eventoRepo  = inject(EVENTO_REPOSITORY_TOKEN);

  /*
   * Cierra el conteo a nivel de evento (no de un TAG puntual): exige que no
   * quede ninguna ubicación EN_CURSO, calcula faltantes contra la muestra
   * completa y deja el evento en CERRADO (sin faltantes) o EN_ANALISIS
   * (quedó algo sin contar — backoffice deberá armar el reconteo).
   */
  async execute(eventoId: number, operadorId: number, pdaId: number): Promise<ResultadoFinalizarEvento> {
    // Cerrar dos veces el mismo conteo volvería a mover el estado del evento y
    // pisaría el resultado del cierre anterior. Se corta acá, no solo en la UI.
    const evento = await this.eventoRepo.getById(eventoId);
    if (evento && (evento.estado === 'CERRADO' || evento.estado === 'EN_ANALISIS')) {
      throw new Error('El conteo de este evento ya está finalizado.');
    }

    const resumenes  = await this.conteoRepo.getResumenes(operadorId, pdaId);
    const delEvento  = resumenes.filter((r) => r.eventoId === eventoId);
    const hayEnCurso = delEvento.some((r) => r.estado === 'EN_CURSO');
    if (hayEnCurso) {
      throw new Error('Aún quedan TAGs en curso — finalízalos antes de cerrar el conteo del evento.');
    }

    const muestra      = await this.muestraRepo.getByEvento(eventoId);
    const totalMuestra = muestra ? (await this.detalleRepo.getByMuestra(muestra.id)).length : 0;
    const skusContados = await this.conteoRepo.getSkusContadosPorEvento(eventoId, operadorId, pdaId);
    const faltantes    = Math.max(0, totalMuestra - skusContados.length);
    const estado: Evento['estado'] = faltantes > 0 ? 'EN_ANALISIS' : 'CERRADO';

    await this.eventoRepo.updateEstado(eventoId, estado);

    return { estado, totalMuestra, contados: skusContados.length, faltantes };
  }
}
