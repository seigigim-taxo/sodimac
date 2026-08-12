import { Injectable, inject, signal, computed } from '@angular/core';
import { GetZonasBySucursalUseCase } from '../../application/zona/get-zonas-by-sucursal.use-case';
import { RegistrarUbicacionUseCase } from '../../application/ubicacion/registrar-ubicacion.use-case';
import { Zona } from '../../domain/zona/models/zona.model';
export type { Zona };

@Injectable({ providedIn: 'root' })
export class ZonaFacade {
  private getZonasBySucursal = inject(GetZonasBySucursalUseCase);
  private registrarUbicacion = inject(RegistrarUbicacionUseCase);

  private zonesSignal        = signal<Zona[]>([]);
  private selectedZoneSignal = signal<Zona | null>(null);
  private tagValueSignal     = signal<string>('');
  private ubicacionIdSignal  = signal<number | null>(null);
  private ubicacionPrecisaSignal = signal<string>('');
  private loadingSignal      = signal(false);
  private errorSignal        = signal<string | null>(null);

  readonly zones             = this.zonesSignal.asReadonly();
  readonly selectedZone      = this.selectedZoneSignal.asReadonly();
  readonly tagValue          = this.tagValueSignal.asReadonly();
  readonly ubicacionId       = this.ubicacionIdSignal.asReadonly();
  readonly ubicacionPrecisa  = this.ubicacionPrecisaSignal.asReadonly();
  readonly loading           = this.loadingSignal.asReadonly();
  readonly error             = this.errorSignal.asReadonly();
  readonly hasZones          = computed(() => this.zonesSignal().length > 0);
  readonly noZones           = computed(() => this.zonesSignal().length === 0 && !this.loadingSignal());
  readonly canContinue       = computed(() =>
    this.tagValueSignal() !== '' &&
    this.selectedZoneSignal() !== null &&
    this.ubicacionPrecisaSignal().trim() !== ''
  );

  async loadZonas(sucursalId: number): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    try {
      this.zonesSignal.set(await this.getZonasBySucursal.execute(sucursalId));
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al cargar zonas');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  setTag(tag: string): void {
    this.tagValueSignal.set(tag);
  }

  setUbicacionPrecisa(valor: string): void {
    this.ubicacionPrecisaSignal.set(valor);
  }

  selectZona(zona: Zona): void {
    this.selectedZoneSignal.set(zona);
  }

  async confirmZona(): Promise<void> {
    const zona = this.selectedZoneSignal();
    const tag  = this.tagValueSignal();
    const ubicacionPrecisa = this.ubicacionPrecisaSignal().trim();
    if (!zona || !tag || !ubicacionPrecisa) return;
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    try {
      const id = await this.registrarUbicacion.execute(zona.id, ubicacionPrecisa, tag);
      this.ubicacionIdSignal.set(id);
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al registrar ubicación');
      throw err;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  reset(): void {
    this.zonesSignal.set([]);
    this.selectedZoneSignal.set(null);
    this.tagValueSignal.set('');
    this.ubicacionIdSignal.set(null);
    this.ubicacionPrecisaSignal.set('');
    this.errorSignal.set(null);
  }
}
