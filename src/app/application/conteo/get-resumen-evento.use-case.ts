import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra.repository';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra-detalle.repository';

/*
 * Avance del conteo, no evaluación de su resultado: no lleva "faltantes" porque
 * juzgar si el conteo estuvo completo es del SGO, no de la PDA.
 */
export interface ResumenEvento {
  totalMuestra: number;
  contados: number;
  tagsFinalizados: number;
  iteracion: number;
  qContado: number;
}

@Injectable({ providedIn: 'root' })
export class GetResumenEventoUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);
  private muestraRepo = inject(MUESTRA_REPOSITORY_TOKEN);
  private detalleRepo = inject(MUESTRA_DETALLE_REPOSITORY_TOKEN);

  // Lectura pura (sin tocar el estado del evento) — para mostrar el resumen de
  // un evento ya cerrado o en análisis, ej. en el historial de Home.
  async execute(eventoId: number, operadorId: number, pdaId: number): Promise<ResumenEvento> {
    const resumenes = await this.conteoRepo.getResumenes(operadorId, pdaId);
    const delEvento = resumenes.filter((r) => r.eventoId === eventoId);
    const tagsFinalizados = delEvento.filter((r) => r.estado === 'FINALIZADO' || r.estado === 'SINCRONIZADO').length;
    /*
     * La ronda del resumen: la abierta si el evento está en curso, o la última
     * registrada si ya se cerró (este caso de uso también sirve al historial).
     */
    const ronda = await this.conteoRepo.getRondaAbierta(eventoId)
               ?? await this.conteoRepo.getUltimaRonda(eventoId);
    const iteracion = ronda?.iteracion ?? 1;

    const muestra = await this.muestraRepo.getByEventoIteracion(eventoId, iteracion);
    const totalMuestra = muestra ? (await this.detalleRepo.getByMuestra(muestra.id)).length : 0;
    const skusContados = await this.conteoRepo.getSkusContadosPorEvento(eventoId, operadorId, pdaId);
    const qContado = await this.conteoRepo.getUnidadesContadasPorEvento(eventoId, operadorId, pdaId);

    return { totalMuestra, contados: skusContados.length, tagsFinalizados, iteracion, qContado };
  }
}
