import { Injectable, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ZoneService } from '../../data/zone/zone.service';
import { Zone } from '../../domain/zone/models/zone.model';

@Injectable({ providedIn: 'root' })
export class ZoneFacade {
  private zoneService = inject(ZoneService);

  private zonesSignal = signal<Zone[]>([]);
  private selectedZoneSignal = signal<Zone | null>(null);
  private tagConfirmedSignal = signal(false);
  private tagValueSignal = signal('');
  private loadingSignal = signal(false);
  private errorSignal = signal<string | null>(null);

  readonly zones = this.zonesSignal.asReadonly();
  readonly selectedZone = this.selectedZoneSignal.asReadonly();
  readonly tagConfirmed = this.tagConfirmedSignal.asReadonly();
  readonly tagValue = this.tagValueSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  readonly hasZones = computed(() => this.zonesSignal().length > 0);
  readonly noZones = computed(() => this.zonesSignal().length === 0 && !this.loadingSignal());
  readonly canContinue = computed(() => this.selectedZoneSignal() !== null && this.tagConfirmedSignal());

  async loadZones(eventId: number, operatorId: number): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    this.selectedZoneSignal.set(null);
    this.zonesSignal.set([]);

    try {
      const zones = await firstValueFrom(this.zoneService.getZonesByEventAndOperator(eventId, operatorId));
      this.zonesSignal.set(zones);
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al cargar zonas');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  selectZone(zone: Zone): void {
    this.selectedZoneSignal.set(zone);
  }

  confirmTag(tag: string): void {
    this.tagValueSignal.set(tag);
    this.tagConfirmedSignal.set(true);
  }
}
