import { Injectable, inject, signal, computed } from '@angular/core';
import { GetEventosBySucursalUseCase } from '../../application/evento/get-eventos-by-sucursal.use-case';
import { AbrirSiguienteIteracionUseCase, ResultadoAbrirIteracion } from '../../application/conteo/abrir-siguiente-iteracion.use-case';
import { GetEventoByIdUseCase } from '../../application/evento/get-evento-by-id.use-case';
import { CerrarEventoUseCase } from '../../application/evento/cerrar-evento.use-case';
import { SeleccionarEventoUseCase } from '../../application/evento/seleccionar-evento.use-case';
import { Evento } from '../../domain/evento/models/evento.model';
export type { Evento };

@Injectable({ providedIn: 'root' })
export class EventoFacade {
  private getEventosBySucursal = inject(GetEventosBySucursalUseCase);
  private abrirIteracionUC     = inject(AbrirSiguienteIteracionUseCase);
  private getEventoById        = inject(GetEventoByIdUseCase);
  private cerrarEventoUC       = inject(CerrarEventoUseCase);
  private seleccionarEventoUC  = inject(SeleccionarEventoUseCase);

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

  /*
   * La persistencia va sin await: la UI no puede quedar esperando a Preferences
   * para pintar el evento elegido. Si falla, se pierde la restauración tras un
   * reinicio, no la selección en curso — por eso solo se registra el error.
   */
  selectEvento(evento: Evento): void {
    this.selectedEventSignal.set(evento);
    this.seleccionarEventoUC.execute(evento.id).catch((err) =>
      console.error('[EventoFacade] no se pudo persistir el evento seleccionado:', err)
    );
  }

  /*
   * Restaura la selección al arrancar. Separado de selectEvento porque no tiene
   * que volver a escribir lo que se acaba de leer.
   */
  restaurarSeleccion(evento: Evento): void {
    this.selectedEventSignal.set(evento);
  }

  async limpiarSeleccion(): Promise<void> {
    this.selectedEventSignal.set(null);
    await this.seleccionarEventoUC.limpiar();
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
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al abrir la ronda siguiente');
      return null;
    }
  }

  async cerrarSeleccionado(): Promise<boolean> {
    const evento = this.selectedEventSignal();
    if (!evento) return false;

    this.errorSignal.set(null);
    try {
      await this.cerrarEventoUC.execute(evento.id);
      await this.refreshSelected();
      return true;
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al cerrar el evento');
      return false;
    }
  }
}
