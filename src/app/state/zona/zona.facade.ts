import { Injectable, inject, isDevMode, signal, computed } from '@angular/core';
import { GetZonasBySucursalUseCase } from '../../application/zona/get-zonas-by-sucursal.use-case';
import { RegistrarUbicacionUseCase } from '../../application/ubicacion/registrar-ubicacion.use-case';
import { Zona } from '../../domain/zona/models/zona.model';
import {
  ResolucionZona,
  detectarSuperposiciones,
  resolverZonaPorTag,
} from '../../domain/zona/utils/zona-por-tag.utils';
export type { Zona, ResolucionZona };

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
      const zonas = await this.getZonasBySucursal.execute(sucursalId);
      this.zonesSignal.set(zonas);
      this.avisarSuperposiciones(zonas);
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

  /*
   * Deriva la zona del número de TAG y la deja seleccionada si la encuentra.
   * Reemplaza a que el operador la elija: el rango de la zona ya venía del WS,
   * solo que hasta ahora servía para validar la elección en vez de hacerla.
   *
   * Devuelve el desenlace para que la pantalla decida qué decirle al operador;
   * si no resuelve, no toca la selección anterior — dejarla a medias haría que
   * el botón de continuar mirara una zona que no corresponde al TAG tipeado.
   */
  aplicarZonaPorTag(tag: string): ResolucionZona {
    const resolucion = resolverZonaPorTag(tag, this.zonesSignal());
    if (resolucion.estado === 'RESUELTA') {
      this.selectedZoneSignal.set(resolucion.zona);
    }
    return resolucion;
  }

  /*
   * Los rangos superpuestos son un error de datos del WS que, sin esto, no se
   * nota: la derivación devuelve la primera zona que encuentra y el conteo se
   * imputa a la zona equivocada en silencio. El cliente confirmó que hoy no hay
   * superposiciones — esto está para el día que eso cambie.
   */
  private avisarSuperposiciones(zonas: Zona[]): void {
    if (!isDevMode()) return;
    const pares = detectarSuperposiciones(zonas);
    if (pares.length === 0) return;
    console.warn(
      '[ZonaFacade] rangos de TAG superpuestos — la derivación de zona es ambigua:',
      pares.map(([a, b]) => `${a.nombre}(${a.tagDesde}-${a.tagHasta}) ∩ ${b.nombre}(${b.tagDesde}-${b.tagHasta})`)
    );
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

  /*
   * Rehidrata la sesión de TAG tras un reinicio. La ubicación ya existe en
   * sod_ubicacion (por eso llega su id): no hay que registrarla de nuevo, solo
   * volver a apuntar a ella. Sin esto, tagEnSesionGuard rebota /counting aunque
   * el conteo siga abierto en la base.
   */
  restaurarSesion(zona: Zona, tag: string, ubicacionId: number, ubicacionPrecisa: string): void {
    this.selectedZoneSignal.set(zona);
    this.tagValueSignal.set(tag);
    this.ubicacionIdSignal.set(ubicacionId);
    this.ubicacionPrecisaSignal.set(ubicacionPrecisa);
    this.errorSignal.set(null);
  }

  /* La zona se deriva del TAG: si el TAG cambia, la zona anterior ya no aplica. */
  clearZona(): void {
    this.selectedZoneSignal.set(null);
  }

  clearTag(): void {
    this.tagValueSignal.set('');
    this.ubicacionIdSignal.set(null);
    this.errorSignal.set(null);
  }

  clearUbicacionYTag(): void {
    this.ubicacionPrecisaSignal.set('');
    this.tagValueSignal.set('');
    this.ubicacionIdSignal.set(null);
    this.errorSignal.set(null);
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
