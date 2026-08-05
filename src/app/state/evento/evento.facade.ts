import { Injectable, inject, signal, computed } from '@angular/core';
import { GetEventosBySucursalUseCase } from '../../application/evento/get-eventos-by-sucursal.use-case';
import { AbrirSiguienteIteracionUseCase, ResultadoAbrirIteracion } from '../../application/conteo/abrir-siguiente-iteracion.use-case';
import { GetEventoByIdUseCase } from '../../application/evento/get-evento-by-id.use-case';
import { Evento } from '../../domain/evento/models/evento.model';
export type { Evento };

@Injectable({ providedIn: 'root' })
export class EventoFacade {
  private getEventosBySucursal = inject(GetEventosBySucursalUseCase);
  private abrirIteracionUC     = inject(AbrirSiguienteIteracionUseCase);
  private getEventoById        = inject(GetEventoByIdUseCase);

  private eventsSignal         = signal<Evento[]>([]);
  private selectedEventSignal  = signal<Evento | null>(null);
  private loadingSignal        = signal(false);
  private errorSignal          = signal<string | null>(null);

  readonly events         = this.eventsSignal.asReadonly();
  readonly selectedEvent  = this.selectedEventSignal.asReadonly();
  readonly loading        = this.loadingSignal.asReadonly();
  readonly error          = this.errorSignal.asReadonly();
  readonly hasEvents      = computed(() => this.eventsSignal().length > 0);
  readonly noEvents       = computed(() => this.eventsSignal().length === 0 && !this.loadingSignal());

  async loadEventos(sucursalId: number): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    try {
      this.eventsSignal.set(await this.getEventosBySucursal.execute(sucursalId));
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al cargar eventos');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  selectEvento(evento: Evento): void {
    this.selectedEventSignal.set(evento);
  }

  /*
   * Relee el evento seleccionado desde la base. Necesario después de cualquier
   * acción que cambie su estado (finalizar el conteo, abrir una iteración): el
   * caso de uso escribe en SQLite, pero el objeto que quedó en el signal es el
   * de antes, y toda la UI que decide por `estado` seguiría viendo el viejo.
   */
  async refreshSelected(): Promise<void> {
    const actual = this.selectedEventSignal();
    if (!actual) return;

    const actualizado = await this.getEventoById.execute(actual.id);
    if (!actualizado) return;

    this.selectedEventSignal.set(actualizado);
    // La lista también: Home pinta el badge de estado desde ahí.
    this.eventsSignal.update((prev) => prev.map((e) => (e.id === actualizado.id ? actualizado : e)));
  }

  /*
   * Abre la ronda siguiente del evento seleccionado y recarga desde la base para
   * que `selectedEvent` quede con la iteración y el estado nuevos — el resto de
   * la app lee la iteración de acá, no la calcula por su cuenta.
   *
   * `iteracionSgo` queda disponible para cuando el análisis del SGO devuelva el
   * número; sin ese dato, la app usa la ronda registrada + 1. Ese número es
   * informativo: no se persiste en ninguna parte (ver AbrirSiguienteIteracionUseCase).
   */
  async abrirSiguienteIteracion(iteracionSgo?: number): Promise<ResultadoAbrirIteracion | null> {
    const evento = this.selectedEventSignal();
    if (!evento) return null;

    this.errorSignal.set(null);
    try {
      const resultado = await this.abrirIteracionUC.execute(evento.id, iteracionSgo);
      await this.refreshSelected();
      return resultado;
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al abrir la iteración siguiente');
      return null;
    }
  }
}
