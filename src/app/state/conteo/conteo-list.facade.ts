import { Injectable, inject, signal, computed } from '@angular/core';
import { GetConteosUseCase } from '../../application/conteo/get-conteos.use-case';
import { DeleteConteoSesionUseCase } from '../../application/conteo/delete-conteo-sesion.use-case';
import { SincronizarConteoUseCase } from '../../application/sincronizacion/sincronizar-conteo.use-case';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
export type { ConteoResumen };

// Identidad de un ConteoResumen: sod_ubicacion se reutiliza entre eventos,
// así que ubicacionId solo no basta para distinguir dos conteos.
function keyOf(conteo: ConteoResumen): string {
  return `${conteo.eventoId}-${conteo.ubicacionId}-${conteo.estado}`;
}

@Injectable({ providedIn: 'root' })
export class ConteoListFacade {
  private getConteos    = inject(GetConteosUseCase);
  private deleteSesion  = inject(DeleteConteoSesionUseCase);
  private sincronizarUC = inject(SincronizarConteoUseCase);

  private conteosSignal      = signal<ConteoResumen[]>([]);
  private seleccionadoSignal = signal<ConteoResumen | null>(null);
  private loadingSignal      = signal(false);
  private errorSignal        = signal<string | null>(null);
  private syncingKeysSignal  = signal<ReadonlySet<string>>(new Set());

  readonly conteos       = this.conteosSignal.asReadonly();
  readonly seleccionado  = this.seleccionadoSignal.asReadonly();
  readonly loading       = this.loadingSignal.asReadonly();
  readonly error         = this.errorSignal.asReadonly();
  readonly enCurso       = computed(() => this.conteosSignal().filter((c) => c.estado === 'EN_CURSO'));
  readonly finalizados   = computed(() => this.conteosSignal().filter((c) => c.estado === 'FINALIZADO'));
  readonly sincronizados = computed(() => this.conteosSignal().filter((c) => c.estado === 'SINCRONIZADO'));
  readonly noConteos     = computed(() => this.conteosSignal().length === 0 && !this.loadingSignal());

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
}
