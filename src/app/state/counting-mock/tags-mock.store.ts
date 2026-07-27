import { Injectable, inject, signal, computed } from '@angular/core';
import { EventoFacade } from '../evento/evento.facade';

/*
 * MOCK — store compartido en memoria para la etapa de maquetación.
 * Vive en `providedIn: 'root'` para que la pantalla de trabajo (donde se
 * finalizan tags) y la pantalla de resumen (donde se listan) vean los
 * mismos datos al navegar entre ellas. Se pierde al recargar la app —
 * eso es exactamente lo que resuelve la persistencia real en el
 * siguiente paso (dominio/aplicación/data), no esta etapa.
 *
 * Todo queda scopeado por eventoId (evento seleccionado en EventoFacade):
 * tags de un evento cerrado no deben mezclarse con los del evento actual
 * si el operador cambia de evento sin recargar la app.
 */

export type EstadoTag = 'PENDIENTE' | 'ENVIADO';

export interface TagMock {
  eventoId: number;
  codigo: string;
  zona: string;
  cantidadProductos: number;
  skus: string[];
  hora: string;
  estado: EstadoTag;
}

// MOCK — muestra fija usada por las pantallas de conteo mientras se integra
// la persistencia real. Define tanto los SKUs esperados como sus descripciones.
export const MUESTRA_MOCK: Record<string, string> = {
  AF000037001: 'Taladro percutor 500W',
  AF000037002: 'Sierra circular 7 1/4"',
  AF000037003: 'Martillo carpintero 16oz',
  AF000037004: 'Set destornilladores 6 pzs',
  AF000037005: 'Cinta métrica 5m',
  AF000037006: 'Pintura látex blanco 1gl',
  AF000037007: 'Brocha 2" cerda natural',
  AF000037008: 'Alargador eléctrico 5m',
  AF000037009: 'Candado bronce 40mm',
  AF000037010: 'Silicona transparente 280ml',
};

@Injectable({ providedIn: 'root' })
export class TagsMockStore {
  private eventoFacade = inject(EventoFacade);

  private tagsSignal         = signal<TagMock[]>([]);
  private sincronizandoSignal = signal<Set<string>>(new Set());

  private eventoActualId = computed(() => this.eventoFacade.selectedEvent()?.id ?? null);

  // Todo lo público queda filtrado al evento seleccionado — un tag de otro evento nunca se cuela aquí.
  readonly tags = computed(() => {
    const eventoId = this.eventoActualId();
    return eventoId === null ? [] : this.tagsSignal().filter((t) => t.eventoId === eventoId);
  });
  readonly sincronizando = this.sincronizandoSignal.asReadonly();

  readonly pendientes    = computed(() => this.tags().filter((t) => t.estado === 'PENDIENTE'));
  readonly finalizados   = computed(() => this.tags().filter((t) => t.estado === 'ENVIADO'));
  // Exige al menos un TAG — usado por "Finalizar conteo" (no tiene sentido cerrar un conteo vacío).
  readonly todosEnviados = computed(() => this.tags().length > 0 && this.tags().every((t) => t.estado === 'ENVIADO'));
  // Vacío también sirve — usado por "Cerrar tienda", que debe poder ejecutarse aunque no se haya contado nada hoy.
  readonly puedeCerrarTienda = computed(() => this.pendientes().length === 0);

  // SKUs distintos contados en CUALQUIER tag del evento actual (independiente de si ya sincronizó) — para el resumen final.
  readonly skusContadosGlobal = computed(() =>
    new Set(this.tags().reduce<string[]>((acc, t) => acc.concat(t.skus), []))
  );

  // Resumen global contra la muestra
  readonly muestraSkus     = signal<string[]>(Object.keys(MUESTRA_MOCK)).asReadonly();
  readonly totalMuestra    = computed(() => this.muestraSkus().length);
  readonly totalContados   = computed(() => this.skusContadosGlobal().size);
  readonly totalFaltantes  = computed(() => this.totalMuestra() - this.totalContados());

  // Todos los tags agrupados por evento — para listar el estado de conteo de
  // varios eventos a la vez en Home (no solo el evento seleccionado).
  private tagsPorEvento = computed(() => {
    const map = new Map<number, TagMock[]>();
    for (const t of this.tagsSignal()) {
      const arr = map.get(t.eventoId) ?? [];
      arr.push(t);
      map.set(t.eventoId, arr);
    }
    return map;
  });

  tieneConteo(eventoId: number): boolean {
    return (this.tagsPorEvento().get(eventoId)?.length ?? 0) > 0;
  }

  resumenDe(eventoId: number): { finalizados: number; pendientes: number; contados: number; faltantes: number; cerrado: boolean } {
    const tags = this.tagsPorEvento().get(eventoId) ?? [];
    const finalizados = tags.filter((t) => t.estado === 'ENVIADO').length;
    const pendientes  = tags.length - finalizados;
    const contados    = new Set(tags.reduce<string[]>((acc, t) => acc.concat(t.skus), [])).size;
    return {
      finalizados,
      pendientes,
      contados,
      faltantes: this.totalMuestra() - contados,
      cerrado:   tags.length > 0 && pendientes === 0,
    };
  }

  yaUsado(codigo: string): boolean {
    return this.tags().some((t) => t.codigo === codigo);
  }

  agregarPendiente(datos: { codigo: string; zona: string; cantidadProductos: number; skus: string[] }): void {
    const eventoId = this.eventoActualId();
    if (eventoId === null) return;

    const nuevo: TagMock = {
      ...datos,
      eventoId,
      hora:   new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      estado: 'PENDIENTE',
    };
    this.tagsSignal.update((prev) => [nuevo, ...prev]);
    void this.intentarSincronizar(nuevo.codigo);
  }

  reintentar(codigo: string): void {
    void this.intentarSincronizar(codigo);
  }

  private async intentarSincronizar(codigo: string): Promise<void> {
    this.sincronizandoSignal.update((prev) => new Set(prev).add(codigo));
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Simulado: 70% de éxito, para poder probar ambos estados en pantalla.
    const exito = Math.random() < 0.7;
    this.tagsSignal.update((prev) =>
      prev.map((t) => (t.codigo === codigo ? { ...t, estado: exito ? 'ENVIADO' : 'PENDIENTE' } : t))
    );
    this.sincronizandoSignal.update((prev) => {
      const next = new Set(prev);
      next.delete(codigo);
      return next;
    });
  }
}
