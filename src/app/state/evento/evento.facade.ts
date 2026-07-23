import { Injectable, inject, signal, computed } from '@angular/core';
import { GetEventosBySucursalUseCase } from '../../application/evento/get-eventos-by-sucursal.use-case';
import { Evento } from '../../domain/evento/models/evento.model';
export type { Evento };

@Injectable({ providedIn: 'root' })
export class EventoFacade {
  private getEventosBySucursal = inject(GetEventosBySucursalUseCase);

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
}
