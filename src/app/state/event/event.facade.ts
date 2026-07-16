import { Injectable, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { EventService } from '../../data/event/event.service';
import { InventoryEvent } from '../../domain/event/models/event.model';

@Injectable({ providedIn: 'root' })
export class EventFacade {
  private eventService = inject(EventService);

  private eventsSignal = signal<InventoryEvent[]>([]);
  private selectedEventSignal = signal<InventoryEvent | null>(null);
  private loadingSignal = signal(false);
  private errorSignal = signal<string | null>(null);

  readonly events = this.eventsSignal.asReadonly();
  readonly selectedEvent = this.selectedEventSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  readonly hasEvents = computed(() => this.eventsSignal().length > 0);
  readonly noEvents = computed(() => this.eventsSignal().length === 0 && !this.loadingSignal());
  readonly currentEvent = computed(() => this.selectedEventSignal() ?? null);

  async loadEvents(storeId: number): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    this.selectedEventSignal.set(null);
    this.eventsSignal.set([]);

    try {
      const events = await firstValueFrom(this.eventService.getEventsByStore(storeId));
      this.eventsSignal.set(events);

      if (events.length === 1) {
        this.selectedEventSignal.set(events[0]);
      }
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al cargar eventos');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  selectEvent(event: InventoryEvent): void {
    this.selectedEventSignal.set(event);
  }
}
