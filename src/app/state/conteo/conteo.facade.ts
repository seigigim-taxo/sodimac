import { Injectable, inject, signal, computed } from '@angular/core';
import { IniciarSesionConteoUseCase } from '../../application/conteo/iniciar-sesion-conteo.use-case';
import { LoadMuestraSetUseCase, MuestraSet } from '../../application/conteo/load-muestra-set.use-case';
import { UpsertConteoItemUseCase } from '../../application/conteo/upsert-conteo-item.use-case';
import { AdjustConteoItemUseCase } from '../../application/conteo/adjust-conteo-item.use-case';
import { DeleteConteoItemUseCase } from '../../application/conteo/delete-conteo-item.use-case';
import { FinalizarSesionConteoUseCase } from '../../application/conteo/finalizar-sesion-conteo.use-case';
import { AsegurarRondaAbiertaUseCase } from '../../application/conteo/asegurar-ronda-abierta.use-case';
import { GetConteoDetalleUseCase } from '../../application/conteo/get-conteo-detalle.use-case';
import { GetLecturasSesionUseCase } from '../../application/conteo/get-lecturas-sesion.use-case';
import { AdjustConteoLecturaUseCase } from '../../application/conteo/adjust-conteo-lectura.use-case';
import { DeleteConteoLecturaUseCase } from '../../application/conteo/delete-conteo-lectura.use-case';
import { WriteQueue } from '../../core/utils/write-queue';
import { ConteoItem } from '../../domain/conteo/models/conteo-item.model';
import { ConteoLecturaSesion } from '../../domain/conteo/models/conteo-lectura-sesion.model';
import { SesionConteo } from '../../domain/conteo/models/sesion-conteo.model';
import { MedioCaptura } from '../../domain/conteo/models/medio-captura.model';
export type { ConteoItem, SesionConteo };

@Injectable({ providedIn: 'root' })
export class ConteoFacade {
  private iniciarSesion = inject(IniciarSesionConteoUseCase);
  private loadMuestra   = inject(LoadMuestraSetUseCase);
  private upsertItem    = inject(UpsertConteoItemUseCase);
  private adjustItem    = inject(AdjustConteoItemUseCase);
  private deleteItem    = inject(DeleteConteoItemUseCase);
  private finalizarUC   = inject(FinalizarSesionConteoUseCase);
  private asegurarRonda = inject(AsegurarRondaAbiertaUseCase);
  private getItems      = inject(GetConteoDetalleUseCase);
  private getLecturas   = inject(GetLecturasSesionUseCase);
  private adjustLecturaUC = inject(AdjustConteoLecturaUseCase);
  private deleteLecturaUC = inject(DeleteConteoLecturaUseCase);

  private sesionSignal     = signal<SesionConteo | null>(null);
  private itemsSignal      = signal<ConteoItem[]>([]);
  private lecturasSignal   = signal<ConteoLecturaSesion[]>([]);
  private rechazadosSignal = signal<string[]>([]);
  private loadingSignal    = signal(false);
  private errorSignal      = signal<string | null>(null);
  private recoveredSignal  = signal(false);
  private finalizadaSignal = signal(false);
  private muestraSet: MuestraSet = { skuMap: new Map() };

  // Serializa scan/adjust/delete: evita que dos escrituras SQLite
  // se solapen si el operador escanea muy rápido.
  private writeQueue = new WriteQueue();

  readonly sesion     = this.sesionSignal.asReadonly();
  readonly items      = this.itemsSignal.asReadonly();
  readonly lecturas   = this.lecturasSignal.asReadonly();
  readonly rechazados = this.rechazadosSignal.asReadonly();
  readonly loading    = this.loadingSignal.asReadonly();
  readonly error      = this.errorSignal.asReadonly();
  readonly recovered  = this.recoveredSignal.asReadonly();
  readonly totalItems = computed(() => this.itemsSignal().length);
  readonly enCurso    = computed(() => this.sesionSignal() !== null && !this.finalizadaSignal());

  /*
   * La ronda se resuelve UNA vez acá y viaja en la sesión: de ahí en más, cada
   * línea sabe a qué ronda pertenece sin volver a preguntarlo.
   *
   * Si el evento todavía no tiene ninguna, se abre la primera: contar es
   * justamente lo que la inicia. Lo que no se abre solo es una ronda posterior
   * —eso pasa por el análisis del SGO—, y ahí init() falla con el motivo.
   */
  async init(eventoId: number, ubicacionId: number, operadorId: number, pdaId: number): Promise<void> {
    this.reset();
    this.loadingSignal.set(true);
    try {
      const ronda = await this.asegurarRonda.execute(eventoId);
      const [muestraSet, resultado] = await Promise.all([
        this.loadMuestra.execute(eventoId, ronda.iteracion),
        this.iniciarSesion.execute(ronda.id, ubicacionId, operadorId, pdaId),
      ]);
      this.muestraSet = muestraSet;
      this.sesionSignal.set(resultado.sesion);
      this.itemsSignal.set(resultado.items);
      this.recoveredSignal.set(resultado.recovered);
      await this.recargarLecturas();
    } catch (err) {
      console.error('[ConteoFacade] no se pudo abrir la sesión de conteo:', err);
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al iniciar sesión de conteo');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /*
   * Consulta si un código pertenece a la muestra SIN escribir nada.
   *
   * La necesita el modo "por cantidad": ahí el SKU se lee primero y las unidades
   * se piden después, así que validar recién al guardar obligaría al operador a
   * tipear la cantidad para enterarse de que el producto no correspondía.
   */
  estaEnMuestra(codigoLectura: string): boolean {
    return this.resolverCodigoMuestra(codigoLectura) !== null;
  }

  /*
   * 'valido'    → el código de lectura está en la muestra y quedó persistido
   * 'rechazado' → el código de lectura no está en la muestra (feedback rojo)
   * 'error'     → el código era válido pero la escritura falló (detalle en error())
   */
  async scan(
    codigoLectura: string,
    cantidad = 1,
    medioCaptura: MedioCaptura = 'MANUAL'
  ): Promise<'valido' | 'rechazado' | 'error'> {
    const sesion = this.sesionSignal();
    if (!sesion || this.finalizadaSignal()) return 'rechazado';

    const codigoResuelto = this.resolverCodigoMuestra(codigoLectura);

    if (codigoResuelto === null) {
      this.rechazadosSignal.update((prev) =>
        prev.includes(codigoLectura) ? prev : [codigoLectura, ...prev]
      );
      return 'rechazado';
    }

    const productoId = this.muestraSet.skuMap.get(codigoResuelto)!;

    this.errorSignal.set(null);
    let persistido = false;
    await this.writeQueue.enqueue(async () => {
      try {
        const item = await this.upsertItem.execute(
          sesion.conteoId, sesion.ubicacionId, productoId, sesion.operadorId, sesion.pdaId, cantidad, codigoResuelto, medioCaptura
        );
        this.upsertItemEnMemoria(item);
        await this.recargarLecturas();
        persistido = true;
      } catch (err) {
        this.errorSignal.set(err instanceof Error ? err.message : 'Error al registrar scan');
      }
    });
    return persistido ? 'valido' : 'error';
  }

  /*
   * +/- sobre UNA lectura de la lista. Mueve unidades de esa captura y su
   * detalle padre a la vez; el guard de estado (solo EN_CURSO) está en el
   * repositorio. Serializado en la misma cola que los scans.
   */
  async adjustLectura(lecturaId: number, delta: number): Promise<void> {
    const sesion = this.sesionSignal();
    if (!sesion || this.finalizadaSignal()) return;
    await this.writeQueue.enqueue(async () => {
      try {
        const item = await this.adjustLecturaUC.execute(lecturaId, delta);
        this.upsertItemEnMemoria(item);
        await this.recargarLecturas();
      } catch (err) {
        this.errorSignal.set(err instanceof Error ? err.message : 'Error al ajustar la lectura');
      }
    });
  }

  /* Borra UNA lectura. Si su detalle queda sin capturas, se va también. */
  async deleteLectura(lecturaId: number): Promise<void> {
    const sesion = this.sesionSignal();
    if (!sesion || this.finalizadaSignal()) return;
    await this.writeQueue.enqueue(async () => {
      try {
        await this.deleteLecturaUC.execute(lecturaId);
        await this.recargarItems();
        await this.recargarLecturas();
      } catch (err) {
        this.errorSignal.set(err instanceof Error ? err.message : 'Error al eliminar la lectura');
      }
    });
  }

  private async recargarLecturas(): Promise<void> {
    const sesion = this.sesionSignal();
    if (!sesion) {
      this.lecturasSignal.set([]);
      return;
    }
    this.lecturasSignal.set(
      await this.getLecturas.execute(sesion.conteoId, sesion.ubicacionId, sesion.operadorId, sesion.pdaId)
    );
  }

  /*
   * Recarga el agregado por SKU. Solo hace falta tras borrar una lectura: ahí
   * un detalle puede desaparecer entero, y upsertItemEnMemoria no sabe quitar
   * filas. Para scan y adjust basta con reemplazar el item que devuelve el repo.
   */
  private async recargarItems(): Promise<void> {
    const sesion = this.sesionSignal();
    if (!sesion) return;
    this.itemsSignal.set(
      await this.getItems.execute(sesion.conteoId, sesion.ubicacionId, sesion.operadorId, sesion.pdaId, 'EN_CURSO')
    );
  }

  async adjust(productoId: number, delta: number): Promise<void> {
    const sesion = this.sesionSignal();
    if (!sesion || this.finalizadaSignal()) return;
    await this.writeQueue.enqueue(async () => {
      try {
        const item = await this.adjustItem.execute(
          sesion.conteoId, sesion.ubicacionId, productoId, sesion.operadorId, sesion.pdaId, delta, 'EN_CURSO'
        );
        this.upsertItemEnMemoria(item);
      } catch (err) {
        this.errorSignal.set(err instanceof Error ? err.message : 'Error al ajustar cantidad');
      }
    });
  }

  async delete(productoId: number): Promise<void> {
    const sesion = this.sesionSignal();
    if (!sesion || this.finalizadaSignal()) return;
    await this.writeQueue.enqueue(async () => {
      try {
        await this.deleteItem.execute(
          sesion.conteoId, sesion.ubicacionId, productoId, sesion.operadorId, sesion.pdaId, 'EN_CURSO'
        );
        this.itemsSignal.update((prev) => prev.filter((i) => i.productoId !== productoId));
      } catch (err) {
        this.errorSignal.set(err instanceof Error ? err.message : 'Error al eliminar item');
      }
    });
  }

  async finalizar(): Promise<void> {
    const sesion = this.sesionSignal();
    if (!sesion) return;
    this.loadingSignal.set(true);
    try {
      await this.finalizarUC.execute(sesion.conteoId, sesion.ubicacionId, sesion.operadorId);
      this.finalizadaSignal.set(true);
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Error al finalizar sesión');
      throw err;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  reset(): void {
    this.sesionSignal.set(null);
    this.itemsSignal.set([]);
    this.lecturasSignal.set([]);
    this.rechazadosSignal.set([]);
    this.errorSignal.set(null);
    this.recoveredSignal.set(false);
    this.finalizadaSignal.set(false);
    this.muestraSet = { skuMap: new Map() };
  }

  /*
   * Resuelve el código de lectura escaneado contra el skuMap de la muestra.
   *
   * Busca primero coincidencia exacta. Si no existe y el código empieza con "0",
   * intenta sin ese primer carácter para cubrir el caso de Excel/WS que elimina
   * ceros iniciales (ej: PDA escanea 079567520375, muestra tiene 79567520375).
   *
   * Devuelve el código resuelto (el que existe en la muestra) o null si no
   * hay coincidencia.
   */
  private resolverCodigoMuestra(codigoLectura: string): string | null {
    const normalizado = codigoLectura.trim().toUpperCase();
    if (this.muestraSet.skuMap.has(normalizado)) return normalizado;

    if (normalizado.startsWith('0')) {
      const sinCero = normalizado.slice(1);
      if (this.muestraSet.skuMap.has(sinCero)) return sinCero;
    }

    return null;
  }

  // Inserta o actualiza el item en el signal sin recargar toda la lista
  private upsertItemEnMemoria(item: ConteoItem): void {
    this.itemsSignal.update((prev) => {
      const idx = prev.findIndex((i) => i.productoId === item.productoId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = item;
        return next;
      }
      return [item, ...prev];
    });
  }
}
