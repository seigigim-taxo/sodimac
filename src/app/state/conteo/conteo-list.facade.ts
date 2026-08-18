import { Injectable, inject, signal, computed } from '@angular/core';
import { GetConteosUseCase } from '../../application/conteo/get-conteos.use-case';
import { GetRondaActivaUseCase } from '../../application/conteo/get-ronda-activa.use-case';
import { DeleteConteoSesionUseCase } from '../../application/conteo/delete-conteo-sesion.use-case';
import { SincronizarConteoUseCase } from '../../application/sincronizacion/sincronizar-conteo.use-case';
import { GetTagsReconteoUseCase } from '../../application/conteo/get-tags-reconteo.use-case';
import { ReabrirTagUseCase } from '../../application/conteo/reabrir-tag.use-case';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
export type { ConteoResumen };

// Identidad de un ConteoResumen: sod_ubicacion se reutiliza entre eventos,
// así que ubicacionId solo no basta para distinguir dos conteos. La iteración
// tampoco basta sola porque dos TAGs distintos pueden tener la misma iteración.
function keyOf(conteo: ConteoResumen): string {
  return `${conteo.eventoId}-${conteo.ubicacionId}-${conteo.iteracion}-${conteo.estado}`;
}

@Injectable({ providedIn: 'root' })
export class ConteoListFacade {
  private getConteos    = inject(GetConteosUseCase);
  private getRonda      = inject(GetRondaActivaUseCase);
  private deleteSesion  = inject(DeleteConteoSesionUseCase);
  private sincronizarUC = inject(SincronizarConteoUseCase);
  private getTagsUC     = inject(GetTagsReconteoUseCase);
  private reabrirTagUC  = inject(ReabrirTagUseCase);

  private conteosSignal      = signal<ConteoResumen[]>([]);
  private seleccionadoSignal = signal<ConteoResumen | null>(null);
  private loadingSignal      = signal(false);
  private errorSignal        = signal<string | null>(null);
  private syncingKeysSignal  = signal<ReadonlySet<string>>(new Set());

  // TAGs sugeridos para reconteo: los que ya se contaron en iteraciones anteriores.
  /*
   * Ronda en curso del evento seleccionado. Vive acá y no en EventoFacade porque
   * se deriva de sod_conteo — el evento no guarda la iteración.
   */
  private iteracionActivaSignal = signal(1);

  private tagsReconteoSignal = signal<string[]>([]);
  private tagsReconteoLoadingSignal = signal(false);

  readonly conteos       = this.conteosSignal.asReadonly();
  readonly seleccionado  = this.seleccionadoSignal.asReadonly();
  readonly loading       = this.loadingSignal.asReadonly();
  readonly error         = this.errorSignal.asReadonly();
  readonly enCurso       = computed(() => this.conteosSignal().filter((c) => c.estado === 'EN_CURSO'));
  readonly finalizados   = computed(() => this.conteosSignal().filter((c) => c.estado === 'FINALIZADO'));
  readonly sincronizados = computed(() => this.conteosSignal().filter((c) => c.estado === 'SINCRONIZADO'));
  readonly noConteos     = computed(() => this.conteosSignal().length === 0 && !this.loadingSignal());

  readonly iteracionActiva    = this.iteracionActivaSignal.asReadonly();
  readonly tagsReconteo       = this.tagsReconteoSignal.asReadonly();
  readonly tagsReconteoLoading = this.tagsReconteoLoadingSignal.asReadonly();

  isSyncing(conteo: ConteoResumen): boolean {
    return this.syncingKeysSignal().has(keyOf(conteo));
  }

  async load(operadorId: number, pdaId: number): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    try {
      this.conteosSignal.set(await this.getConteos.execute(operadorId, pdaId));
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al cargar conteos');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  seleccionar(conteo: ConteoResumen): void {
    this.seleccionadoSignal.set(conteo);
  }

  /*
   * La selección se consume una sola vez al entrar a /counting: así una
   * selección vieja nunca compite con el flujo de zona en visitas posteriores.
   */
  consumirSeleccion(): ConteoResumen | null {
    const conteo = this.seleccionadoSignal();
    this.seleccionadoSignal.set(null);
    return conteo;
  }

  async delete(conteo: ConteoResumen): Promise<void> {
    this.errorSignal.set(null);
    try {
      await this.deleteSesion.execute(
        conteo.eventoId, conteo.ubicacionId, conteo.operadorId, conteo.pdaId, conteo.estado
      );
      this.conteosSignal.update((prev) => prev.filter((c) =>
        !(c.eventoId === conteo.eventoId && c.ubicacionId === conteo.ubicacionId && c.estado === conteo.estado)
      ));
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al eliminar conteo');
    }
  }

  /*
   * Devuelve true solo si el TAG quedó reabierto: la pantalla navega al conteo
   * con ese dato, y navegar tras un fallo la dejaría sin sesión que mostrar.
   */
  async reabrir(conteo: ConteoResumen): Promise<boolean> {
    this.errorSignal.set(null);
    try {
      await this.reabrirTagUC.execute(conteo);
      this.conteosSignal.update((prev) => prev.map((c) =>
        keyOf(c) === keyOf(conteo) ? { ...c, estado: 'EN_CURSO' } : c
      ));
      return true;
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al reabrir el TAG');
      return false;
    }
  }

  async sincronizar(conteo: ConteoResumen): Promise<void> {
    const key = keyOf(conteo);
    this.errorSignal.set(null);
    this.syncingKeysSignal.update((prev) => new Set(prev).add(key));
    try {
      await this.sincronizarUC.execute(conteo);
      // Actualiza el estado localmente: el computed sincronizados() lo mueve de sección solo.
      this.conteosSignal.update((prev) => prev.map((c) =>
        keyOf(c) === key ? { ...c, estado: 'SINCRONIZADO' } : c
      ));
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al sincronizar conteo');
    } finally {
      this.syncingKeysSignal.update((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  /*
   * Carga los TAGs ya contados en iteraciones anteriores para sugerirlos en
   * la pantalla de reconteo. Si iteracionActual === 1, no hay reconteo y la
   * lista queda vacía.
   */
  /*
   * Sin ronda abierta se asume la 1: es la pantalla de TAG pidiendo contexto
   * para sugerir chips, no una operación de escritura. Quien sí corta si falta
   * la ronda es ConteoFacade.init(), antes de dejar contar.
   */
  async cargarIteracionActiva(eventoId: number): Promise<number> {
    const ronda = await this.getRonda.execute(eventoId);
    const iteracion = ronda?.iteracion ?? 1;
    this.iteracionActivaSignal.set(iteracion);
    return iteracion;
  }

  async cargarTagsReconteo(eventoId: number, iteracionActual: number): Promise<void> {
    this.tagsReconteoLoadingSignal.set(true);
    try {
      this.tagsReconteoSignal.set(await this.getTagsUC.execute(eventoId, iteracionActual));
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al cargar TAGs de reconteo');
      this.tagsReconteoSignal.set([]);
    } finally {
      this.tagsReconteoLoadingSignal.set(false);
    }
  }

  /*
   * Indica si un TAG ya fue contado en iteraciones anteriores. Se usa en la
   * UI para decidir si mostrar confirmación al ingresar un TAG nuevo.
   */
  esTagSugerido(tag: string): boolean {
    return this.tagsReconteoSignal().includes(tag.trim().toUpperCase());
  }
}
