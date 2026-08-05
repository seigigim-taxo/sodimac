import { Injectable, inject, signal } from '@angular/core';
import { GetResumenEventoUseCase, ResumenEvento } from '../../application/conteo/get-resumen-evento.use-case';
import { FinalizarEventoUseCase, ResultadoFinalizarEvento } from '../../application/conteo/finalizar-evento.use-case';
import { Evento } from '../../domain/evento/models/evento.model';
export type { ResumenEvento, ResultadoFinalizarEvento };

/* Un evento ya cerrado junto con su resumen reconstruido desde sod_conteo. */
export interface EventoConResumen {
  evento:  Evento;
  resumen: ResumenEvento;
}

/*
 * Resumen a nivel de evento: el avance de la ronda activa y el cierre del
 * conteo. Existe para que las pantallas no inyecten casos de uso directo —
 * los componentes hablan solo con facades.
 */
@Injectable({ providedIn: 'root' })
export class ResumenEventoFacade {
  private getResumenUC   = inject(GetResumenEventoUseCase);
  private finalizarUC    = inject(FinalizarEventoUseCase);

  private avanceSignal    = signal<ResumenEvento | null>(null);
  private cerradosSignal  = signal<EventoConResumen[]>([]);
  private finalizandoSig  = signal(false);
  private errorSignal     = signal<string | null>(null);

  readonly avance      = this.avanceSignal.asReadonly();
  readonly cerrados    = this.cerradosSignal.asReadonly();
  readonly finalizando = this.finalizandoSig.asReadonly();
  readonly error       = this.errorSignal.asReadonly();

  /* Avance de la ronda activa del evento (Q contado, SKUs, faltantes). */
  async cargarAvance(eventoId: number, operadorId: number, pdaId: number): Promise<void> {
    this.errorSignal.set(null);
    try {
      this.avanceSignal.set(await this.getResumenUC.execute(eventoId, operadorId, pdaId));
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al cargar el resumen del evento');
    }
  }

  /*
   * Resumen de los eventos ya cerrados o en análisis. La consulta es una por
   * evento, así que vive acá y no en la pantalla: es orquestación de datos, y
   * en un componente quedaba como un Promise.all dentro de un effect.
   */
  async cargarCerrados(eventos: Evento[], operadorId: number, pdaId: number): Promise<void> {
    const cerrados = eventos.filter((e) => e.estado === 'CERRADO' || e.estado === 'EN_ANALISIS');
    if (cerrados.length === 0) {
      this.cerradosSignal.set([]);
      return;
    }

    try {
      this.cerradosSignal.set(await Promise.all(cerrados.map(async (evento) => ({
        evento,
        resumen: await this.getResumenUC.execute(evento.id, operadorId, pdaId),
      }))));
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al cargar los conteos finalizados');
      this.cerradosSignal.set([]);
    }
  }

  /*
   * Cierra el conteo del evento. Devuelve null si no se pudo: el detalle queda
   * en error() para que la pantalla decida cómo mostrarlo.
   */
  async finalizarEvento(eventoId: number, operadorId: number, pdaId: number): Promise<ResultadoFinalizarEvento | null> {
    this.errorSignal.set(null);
    this.finalizandoSig.set(true);
    try {
      return await this.finalizarUC.execute(eventoId, operadorId, pdaId);
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al finalizar el conteo');
      return null;
    } finally {
      this.finalizandoSig.set(false);
    }
  }
}
