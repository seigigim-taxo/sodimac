import { Injectable, inject, signal } from '@angular/core';
import { GetResumenEventoUseCase, ResumenEvento } from '../../application/conteo/get-resumen-evento.use-case';
import { GetTrazabilidadEventoUseCase } from '../../application/conteo/get-trazabilidad-evento.use-case';
import { ConteoTrazabilidadItem } from '../../domain/conteo/models/conteo-trazabilidad-item.model';
import { Evento } from '../../domain/evento/models/evento.model';
export type { ResumenEvento };

/* Un evento junto con su resumen reconstruido desde sod_conteo. */
export interface EventoConResumen {
  evento:  Evento;
  resumen: ResumenEvento;
}

/*
 * Resumen a nivel de evento: el avance de la ronda activa, y el historial de
 * lo que ya se contó. Existe para que las pantallas no inyecten casos de uso
 * directo — los componentes hablan solo con facades.
 */
@Injectable({ providedIn: 'root' })
export class ResumenEventoFacade {
  private getResumenUC      = inject(GetResumenEventoUseCase);
  private getTrazabilidadUC = inject(GetTrazabilidadEventoUseCase);

  private avanceSignal          = signal<ResumenEvento | null>(null);
  private conAvanceSignal       = signal<EventoConResumen[]>([]);
  private errorSignal           = signal<string | null>(null);
  private trazabilidadSignal    = signal<ConteoTrazabilidadItem[]>([]);
  private trazabilidadLoadingSig = signal(false);

  readonly avance            = this.avanceSignal.asReadonly();
  readonly conAvance         = this.conAvanceSignal.asReadonly();
  readonly error             = this.errorSignal.asReadonly();
  readonly trazabilidad      = this.trazabilidadSignal.asReadonly();
  readonly trazabilidadLoading = this.trazabilidadLoadingSig.asReadonly();

  /*
   * Suelta todo lo cargado. Los datos que viven acá son de UN operador —las
   * consultas filtran por operador_id—, pero los signals son de la app y
   * sobreviven al logout: sin esto, quien entra después ve el historial del
   * turno anterior hasta que alguna pantalla lo recargue.
   */
  reset(): void {
    this.avanceSignal.set(null);
    this.conAvanceSignal.set([]);
    this.trazabilidadSignal.set([]);
    this.errorSignal.set(null);
    this.trazabilidadLoadingSig.set(false);
  }

  /* Avance de la ronda activa del evento (Q contado, SKUs, TAGs). */
  async cargarAvance(eventoId: number, operadorId: number, pdaId: number): Promise<void> {
    this.errorSignal.set(null);
    try {
      this.avanceSignal.set(await this.getResumenUC.execute(eventoId, operadorId, pdaId));
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al cargar el resumen del evento');
    }
  }

  /* Detalle línea a línea de todo lo contado en el evento, por iteración. */
  async cargarTrazabilidad(eventoId: number, operadorId: number, pdaId: number): Promise<void> {
    this.errorSignal.set(null);
    this.trazabilidadLoadingSig.set(true);
    try {
      this.trazabilidadSignal.set(await this.getTrazabilidadUC.execute(eventoId, operadorId, pdaId));
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al cargar la trazabilidad del evento');
      this.trazabilidadSignal.set([]);
    } finally {
      this.trazabilidadLoadingSig.set(false);
    }
  }

  /*
   * Resumen de los eventos que ya tienen algo que mostrar: el historial de
   * Home ("Conteos finalizados") deja de depender del estado del evento —el
   * conteo ya no se "cierra" a nivel de evento— y pasa a mostrarse apenas hay
   * al menos UN TAG finalizado. No hace falta que esté todo sincronizado ni
   * que el operador haya declarado nada por su cuenta.
   *
   * La consulta es una por evento, así que vive acá y no en la pantalla: es
   * orquestación de datos, y en un componente quedaba como un Promise.all
   * dentro de un effect.
   */
  async cargarConAvance(eventos: Evento[], operadorId: number, pdaId: number): Promise<void> {
    if (eventos.length === 0) {
      this.conAvanceSignal.set([]);
      return;
    }

    try {
      const conResumen = await Promise.all(eventos.map(async (evento) => ({
        evento,
        resumen: await this.getResumenUC.execute(evento.id, operadorId, pdaId),
      })));
      this.conAvanceSignal.set(conResumen.filter((er) => er.resumen.tagsFinalizados > 0));
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al cargar el historial de conteos');
      this.conAvanceSignal.set([]);
    }
  }
}
