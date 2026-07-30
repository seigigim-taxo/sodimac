import { Injectable, inject, signal, computed } from '@angular/core';
import { EventoFacade } from '../evento/evento.facade';
import { Evento } from '../../domain/evento/models/evento.model';

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

export interface ZonaMock { id: number; codigo: string; nombre: string; }

// MOCK — zonas fijas de la tienda mientras se integra la persistencia real.
export const ZONAS_MOCK: ZonaMock[] = [
  { id: 1, codigo: 'LC01-V01', nombre: 'Venta Principal' },
  { id: 2, codigo: 'LC01-A01', nombre: 'Altillo Norte' },
];

export type EstadoTag = 'PENDIENTE' | 'ENVIADO';

// Modo de trabajo del evento actual: CONTEO (primera vuelta) o RECONTEO
// (ya se sincronizó al menos una muestra de reconteo). Es un flag explícito,
// no se infiere de la iteración — evita ambigüedad en el resto de la app.
export type ModoConteo = 'CONTEO' | 'RECONTEO';

export interface ItemMock { sku: string; cantidad: number; }

// MOCK — simula la tabla sod_ubicacion: tag + zona con su propio id.
// El conteo se relaciona con la ubicación por este id, no repitiendo tag/zona en cada fila.
export interface UbicacionMock { id: number; tag: string; zonaCodigo: string; }

// TAG que backoffice marcó para recontar: solo referencia a la ubicación (no hay
// "tag" ni "zona" propios acá) + los SKUs que backoffice espera encontrar ahí —
// sin items, el reconteo arranca en 0.
export interface TagARecontarMock { ubicacionId: number; skus: string[]; }

// No existe una entidad "Tag": esto es un Conteo — se crea cada vez que el operador
// elige/escanea una ubicación e inicia a contar. Se relaciona con sod_ubicacion por
// id (como sod_conteo → sod_ubicacion); el tag y la zona se leen de ahí, nunca de este objeto.
//
// cierreId: null mientras el conteo está en curso (ronda activa). Al finalizar, se le
// asigna el id del ConteoCerradoMock al que pertenece — el conteo nunca se mueve a otra
// estructura, solo se le marca a qué cierre quedó asociado (misma fila, misma relación).
export interface TagMock {
  eventoId: number;
  ubicacionId: number;
  cierreId: number | null;
  cantidadProductos: number;
  skus: string[];
  items: ItemMock[];
  hora: string;
  estado: EstadoTag;
}

// Un cierre ("Finalizar conteo") — cada finalización queda como su propia entrada,
// no se agrega por evento. Permite recontar el mismo evento más de una vez y ver
// cada ronda como una card separada. Solo identidad/metadata: los conteos que le
// pertenecen se consultan por relación (tagsDeCierre), no se duplican acá.
export interface ConteoCerradoMock {
  id: number;
  eventoId: number;
  eventoNombre: string;
  iteracion: number;
  faltantes: number; // hecho histórico: cuántos SKUs quedaron sin contar en ESTA ronda —
                      // no se puede derivar de la muestra actual porque esta cambia entre iteraciones.
  cerradoEn: string;
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

const MUESTRA_COMPLETA = Object.keys(MUESTRA_MOCK);

@Injectable({ providedIn: 'root' })
export class TagsMockStore {
  private eventoFacade = inject(EventoFacade);

  private tagsSignal            = signal<TagMock[]>([]);
  private sincronizandoSignal   = signal<Set<number>>(new Set());
  private conteosCerradosSignal = signal<ConteoCerradoMock[]>([]);
  private conteoIdSeq = 1;

  // MOCK de sod_ubicacion — una fila por (tag, zona) con su propio id autoincremental.
  private ubicacionesSignal = signal<UbicacionMock[]>([]);
  private ubicacionIdSeq = 1;

  // Busca la ubicación existente para este tag+zona o la crea — como haría
  // UbicacionRepository.insert() contra sod_ubicacion, pero en memoria.
  private obtenerOCrearUbicacion(tag: string, zonaCodigo: string): number {
    const existente = this.ubicacionesSignal().find((u) => u.tag === tag && u.zonaCodigo === zonaCodigo);
    if (existente) return existente.id;

    const nueva: UbicacionMock = { id: this.ubicacionIdSeq++, tag, zonaCodigo };
    this.ubicacionesSignal.update((prev) => [...prev, nueva]);
    return nueva.id;
  }

  // Resuelve tag/zona de una ubicación por id — así es como la UI muestra el TAG
  // de un conteo: nunca leyéndolo del conteo mismo, siempre vía esta relación.
  obtenerUbicacion(ubicacionId: number): UbicacionMock | undefined {
    return this.ubicacionesSignal().find((u) => u.id === ubicacionId);
  }

  // El código de tag ingresado/escaneado por el operador no es un id — hay que
  // resolverlo contra sod_ubicacion antes de poder buscar el conteo asociado.
  private ubicacionIdDeTag(codigoTag: string): number | null {
    return this.ubicacionesSignal().find((u) => u.tag === codigoTag)?.id ?? null;
  }

  /*
   * Reconteo (mock del ciclo evento ABIERTO → EN_ANALISIS → reconteo):
   * al archivar un conteo con SKUs faltantes, el evento queda "EN_ANALISIS"
   * (simulando que backoffice lo revisa) y la muestra faltante queda
   * pendiente. "Sincronizar" simula que backoffice ya terminó: activa esa
   * muestra reducida como la nueva muestra a contar para ese evento.
   */
  private estadoOverrideSignal    = signal<Map<number, 'EN_ANALISIS' | 'RECONTEO'>>(new Map());
  private muestraPendienteSignal  = signal<Map<number, string[]>>(new Map());
  private muestraPorEventoSignal  = signal<Map<number, string[]>>(new Map());
  // TAGs que backoffice marcó a recontar: "pendiente" es lo que llegó del análisis
  // (aún no descargado), "activa" es lo ya sincronizado y disponible para trabajar.
  private tagsARecontarPendienteSignal = signal<Map<number, TagARecontarMock[]>>(new Map());
  private tagsARecontarActivaSignal    = signal<Map<number, TagARecontarMock[]>>(new Map());

  private eventoActualId = computed(() => this.eventoFacade.selectedEvent()?.id ?? null);

  // Todo lo público queda filtrado al evento seleccionado y a la ronda activa
  // (cierreId null) — un conteo ya archivado no se cuela en la ronda en curso.
  readonly tags = computed(() => {
    const eventoId = this.eventoActualId();
    return eventoId === null ? [] : this.tagsSignal().filter((t) => t.eventoId === eventoId && t.cierreId === null);
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

  // Muestra activa del evento actual: la completa, salvo que esté en modo reconteo (muestra reducida a lo faltante).
  readonly muestraSkus = computed(() => {
    const eventoId = this.eventoActualId();
    if (eventoId === null) return MUESTRA_COMPLETA;
    return this.muestraPorEventoSignal().get(eventoId) ?? MUESTRA_COMPLETA;
  });
  readonly totalMuestra    = computed(() => this.muestraSkus().length);
  readonly totalContados   = computed(() => this.skusContadosGlobal().size);
  readonly totalFaltantes  = computed(() => this.totalMuestra() - this.totalContados());

  // Iteración en curso del evento actual: 1 si es el primer conteo, N+1 si ya se cerraron N conteos antes.
  readonly iteracionActual = computed(() => {
    const eventoId = this.eventoActualId();
    if (eventoId === null) return 1;
    return this.conteosCerradosSignal().filter((c) => c.eventoId === eventoId).length + 1;
  });

  // Flag explícito de modo, derivado del estado efectivo del evento (única fuente de verdad) —
  // CONTEO por defecto, pasa a RECONTEO cuando el evento queda en ese estado tras sincronizar.
  readonly modoActual = computed(() => {
    const eventoId = this.eventoActualId();
    if (eventoId === null) return 'CONTEO' as ModoConteo;
    return this.estadoOverrideSignal().get(eventoId) === 'RECONTEO' ? 'RECONTEO' : 'CONTEO';
  });

  // Conteos cerrados — cada "Finalizar conteo" queda como su propia entrada,
  // en orden del más reciente al más antiguo.
  readonly conteosCerrados = this.conteosCerradosSignal.asReadonly();

  // Solo los del evento seleccionado — para las pestañas de /tags-resumen.
  readonly conteosCerradosDelEventoActual = computed(() => {
    const eventoId = this.eventoActualId();
    return eventoId === null ? [] : this.conteosCerradosSignal().filter((c) => c.eventoId === eventoId);
  });

  // Conteos que pertenecen a un cierre — por relación (cierreId), no por snapshot guardado.
  tagsDeCierre(cierreId: number): TagMock[] {
    return this.tagsSignal().filter((t) => t.cierreId === cierreId);
  }

  // Derivados del cierre vía relación — igual que ConteoResumen es una vista agregada
  // de filas de sod_conteo, no datos duplicados aparte.
  tagsFinalizadosDeCierre(cierreId: number): number {
    return this.tagsDeCierre(cierreId).length;
  }

  contadosDeCierre(cierreId: number): number {
    const skus = this.tagsDeCierre(cierreId).reduce<string[]>((acc, t) => acc.concat(t.skus), []);
    return new Set(skus).size;
  }

  // TAGs de reconteo que aún faltan por trabajar: los sincronizados menos los que ya
  // se volvieron a agregar (finalizados o no) en esta ronda — para la pantalla TAG+Zona.
  readonly tagsPorRecontarPendientes = computed(() => {
    const eventoId = this.eventoActualId();
    if (eventoId === null) return [];
    const lista   = this.tagsARecontarActivaSignal().get(eventoId) ?? [];
    const yaHecho = new Set(this.tags().map((t) => t.ubicacionId));
    return lista.filter((t) => !yaHecho.has(t.ubicacionId));
  });

  // Estado "efectivo" del evento: el override de reconteo si existe, si no el real.
  estadoEfectivo(evento: Evento): Evento['estado'] {
    return this.estadoOverrideSignal().get(evento.id) ?? evento.estado;
  }

  /*
   * Archiva el conteo actual del evento seleccionado como una entrada nueva
   * de "conteos cerrados", y limpia los tags activos de ese evento para que
   * se pueda empezar una ronda nueva (recontar) sin arrastrar los de antes.
   * Requiere que ya estén todos "Enviado" — lo valida quien llama (todosEnviados()).
   *
   * Si quedan SKUs sin contar, el evento pasa a EN_ANALISIS (mock de "se
   * manda a revisión de backoffice") y esos SKUs quedan como la muestra
   * pendiente para el próximo reconteo.
   */
  archivarConteoActual(): void {
    const eventoId     = this.eventoActualId();
    const eventoNombre = this.eventoFacade.selectedEvent()?.nombre;
    if (eventoId === null || eventoNombre === undefined) return;

    const tagsDelConteo = this.tags();
    if (tagsDelConteo.length === 0) return;

    const skusFaltantes  = this.muestraSkus().filter((sku) => !this.skusContadosGlobal().has(sku));
    const iteracion      = this.conteosCerradosSignal().filter((c) => c.eventoId === eventoId).length + 1;

    const nuevo: ConteoCerradoMock = {
      id:        this.conteoIdSeq++,
      eventoId,
      eventoNombre,
      iteracion,
      faltantes: skusFaltantes.length,
      cerradoEn: new Date().toLocaleString('es-CL'),
    };
    this.conteosCerradosSignal.update((prev) => [nuevo, ...prev]);

    // Los conteos de esta ronda quedan marcados con el cierre al que pertenecen —
    // nunca se mueven a otra estructura, solo salen de la ronda activa (tags()).
    this.tagsSignal.update((prev) =>
      prev.map((t) => (t.eventoId === eventoId && t.cierreId === null ? { ...t, cierreId: nuevo.id } : t))
    );
    // La lista de reconteo activa de la ronda anterior ya se completó — se limpia.
    this.tagsARecontarActivaSignal.update((prev) => { const next = new Map(prev); next.delete(eventoId); return next; });

    if (skusFaltantes.length > 0) {
      this.estadoOverrideSignal.update((prev) => new Map(prev).set(eventoId, 'EN_ANALISIS'));
      this.muestraPendienteSignal.update((prev) => new Map(prev).set(eventoId, skusFaltantes));
      // Mock: backoffice pide re-verificar todos los TAGs finalizados de este conteo, cada uno
      // con los SKUs faltantes que le tocan — dato fijo simulado, sin lógica de asignación real.
      this.tagsARecontarPendienteSignal.update((prev) =>
        new Map(prev).set(eventoId, tagsDelConteo.map((t) => ({
          ubicacionId: t.ubicacionId,
          skus:        skusFaltantes,
        })))
      );
    } else {
      // Sin faltantes: el evento ya no queda en análisis ni en reconteo — el ciclo se cierra acá.
      this.estadoOverrideSignal.update((prev) => { const next = new Map(prev); next.delete(eventoId); return next; });
    }
  }

  // ¿Este evento tiene una muestra de reconteo lista para descargar? (botón "Sincronizar" en Home)
  puedeSincronizar(eventoId: number): boolean {
    return this.estadoOverrideSignal().get(eventoId) === 'EN_ANALISIS';
  }

  // Cuántos SKUs quedaron pendientes de este evento mientras está EN_ANALISIS — para mostrarlo en Home.
  skusPendientesAnalisis(eventoId: number): number {
    return this.muestraPendienteSignal().get(eventoId)?.length ?? 0;
  }

  // SKUs que backoffice espera encontrar en ESTA ubicación puntual durante el reconteo —
  // no la muestra completa del evento. Si la ubicación no está en la lista activa
  // (ej. modo CONTEO), cae de vuelta a la muestra general.
  skusEsperadosDeTag(codigoTag: string): string[] {
    const eventoId = this.eventoActualId();
    if (eventoId === null) return this.muestraSkus();
    const ubicacionId = this.ubicacionIdDeTag(codigoTag);
    if (ubicacionId === null) return this.muestraSkus();
    const activa = this.tagsARecontarActivaSignal().get(eventoId) ?? [];
    const entrada = activa.find((t) => t.ubicacionId === ubicacionId);
    return entrada?.skus ?? this.muestraSkus();
  }

  /*
   * Simula que backoffice ya terminó de analizar y define la nueva muestra a
   * recontar: la activa para este evento y el evento pasa de EN_ANALISIS a
   * RECONTEO — ese estado es lo que habilita recontar, no un flag aparte.
   */
  sincronizarReconteo(eventoId: number): boolean {
    const pendiente = this.muestraPendienteSignal().get(eventoId);
    if (!pendiente) return false;

    const tagsARecontar = this.tagsARecontarPendienteSignal().get(eventoId) ?? [];

    this.muestraPorEventoSignal.update((prev) => new Map(prev).set(eventoId, pendiente));
    this.tagsARecontarActivaSignal.update((prev) => new Map(prev).set(eventoId, tagsARecontar));
    this.estadoOverrideSignal.update((prev) => new Map(prev).set(eventoId, 'RECONTEO'));
    this.muestraPendienteSignal.update((prev) => { const next = new Map(prev); next.delete(eventoId); return next; });
    this.tagsARecontarPendienteSignal.update((prev) => { const next = new Map(prev); next.delete(eventoId); return next; });
    return true;
  }

  // Estado del conteo de este TAG en el evento actual, o null si nunca se usó —
  // para saber si se puede reabrir (Pendiente) o está bloqueado (Enviado).
  // Recibe el código escaneado/ingresado y lo resuelve contra sod_ubicacion primero.
  estadoDe(codigoTag: string): EstadoTag | null {
    const ubicacionId = this.ubicacionIdDeTag(codigoTag);
    if (ubicacionId === null) return null;
    return this.tags().find((t) => t.ubicacionId === ubicacionId)?.estado ?? null;
  }

  obtenerTagPorCodigo(codigoTag: string): TagMock | undefined {
    const ubicacionId = this.ubicacionIdDeTag(codigoTag);
    if (ubicacionId === null) return undefined;
    return this.tags().find((t) => t.ubicacionId === ubicacionId);
  }

  /*
   * Agrega (o reemplaza, si se reabrió un conteo Pendiente) el resultado de un
   * TAG finalizado. Upsert por ubicación: reabrir y volver a finalizar
   * actualiza la misma entrada en vez de duplicarla.
   *
   * El conteo se relaciona con su ubicación por id (obtenerOCrearUbicacion),
   * igual que sod_conteo se relaciona con sod_ubicacion — el tag/zona que
   * ingresa el operador llenan sod_ubicacion, no el conteo mismo.
   */
  async agregarPendiente(datos: { codigo: string; zona: string; items: ItemMock[] }): Promise<void> {
    const eventoId = this.eventoActualId();
    if (eventoId === null) return;

    const ubicacionId = this.obtenerOCrearUbicacion(datos.codigo, datos.zona);

    const nuevo: TagMock = {
      eventoId,
      ubicacionId,
      cierreId:          null,
      items:             datos.items,
      skus:              datos.items.map((i) => i.sku),
      cantidadProductos: datos.items.length,
      hora:              new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      estado:            'PENDIENTE',
    };
    // El upsert por ubicación solo reemplaza el conteo ACTIVO (cierreId null) —
    // un conteo ya archivado de una ronda anterior con esta misma ubicación queda intacto.
    this.tagsSignal.update((prev) => [
      nuevo,
      ...prev.filter((t) => !(t.eventoId === eventoId && t.ubicacionId === nuevo.ubicacionId && t.cierreId === null)),
    ]);
    // Se espera acá mismo — quien llama (ej. la pantalla de conteo) queda sincronizado
    // con el resultado real, sin duplicar el delay en un segundo timer propio.
    await this.intentarSincronizar(nuevo.ubicacionId);
  }

  reintentar(ubicacionId: number): void {
    void this.intentarSincronizar(ubicacionId);
  }

  private async intentarSincronizar(ubicacionId: number): Promise<void> {
    this.sincronizandoSignal.update((prev) => new Set(prev).add(ubicacionId));
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Simulado: 50% de error, para poder probar ambos estados en pantalla.
    const exito = Math.random() < 0.5;
    // Solo el conteo ACTIVO de esta ubicación — uno ya archivado en un cierre anterior no se toca.
    this.tagsSignal.update((prev) =>
      prev.map((t) => (t.ubicacionId === ubicacionId && t.cierreId === null ? { ...t, estado: exito ? 'ENVIADO' : 'PENDIENTE' } : t))
    );
    this.sincronizandoSignal.update((prev) => {
      const next = new Set(prev);
      next.delete(ubicacionId);
      return next;
    });
  }
}
