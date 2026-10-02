import { Injectable, inject, signal, computed } from '@angular/core';
import { IniciarSesionConteoUseCase } from '../../application/conteo/iniciar-sesion-conteo.use-case';
import { LoadMuestraSetUseCase, MuestraSet } from '../../application/conteo/load-muestra-set.use-case';
import { BuscarCodigoMuestraUseCase, CodigoResuelto } from '../../application/conteo/buscar-codigo-muestra.use-case';
import { UpsertConteoItemUseCase } from '../../application/conteo/upsert-conteo-item.use-case';
import { AdjustConteoItemUseCase } from '../../application/conteo/adjust-conteo-item.use-case';
import { DeleteConteoItemUseCase } from '../../application/conteo/delete-conteo-item.use-case';
import { FinalizarSesionConteoUseCase } from '../../application/conteo/finalizar-sesion-conteo.use-case';
import { AsegurarRondaAbiertaUseCase } from '../../application/conteo/asegurar-ronda-abierta.use-case';
import { GetConteoDetalleUseCase } from '../../application/conteo/get-conteo-detalle.use-case';
import { GetLecturasSesionUseCase } from '../../application/conteo/get-lecturas-sesion.use-case';
import { AdjustConteoLecturaUseCase } from '../../application/conteo/adjust-conteo-lectura.use-case';
import { DeleteConteoLecturaUseCase } from '../../application/conteo/delete-conteo-lectura.use-case';
import { ObtenerReferenciaSincronizadaUseCase } from '../../application/conteo/obtener-referencia-sincronizada.use-case';
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
  private buscarCodigo  = inject(BuscarCodigoMuestraUseCase);
  private upsertItem    = inject(UpsertConteoItemUseCase);
  private adjustItem    = inject(AdjustConteoItemUseCase);
  private deleteItem    = inject(DeleteConteoItemUseCase);
  private finalizarUC   = inject(FinalizarSesionConteoUseCase);
  private asegurarRonda = inject(AsegurarRondaAbiertaUseCase);
  private getItems      = inject(GetConteoDetalleUseCase);
  private getLecturas   = inject(GetLecturasSesionUseCase);
  private adjustLecturaUC = inject(AdjustConteoLecturaUseCase);
  private deleteLecturaUC = inject(DeleteConteoLecturaUseCase);
  private obtenerReferencia = inject(ObtenerReferenciaSincronizadaUseCase);

  private sesionSignal     = signal<SesionConteo | null>(null);
  private itemsSignal      = signal<ConteoItem[]>([]);
  private lecturasSignal   = signal<ConteoLecturaSesion[]>([]);
  private rechazadosSignal = signal<string[]>([]);
  private loadingSignal    = signal(false);
  private errorSignal      = signal<string | null>(null);
  private recoveredSignal  = signal(false);
  private finalizadaSignal = signal(false);
  /*
   * Lo ya contado en un TAG SINCRONIZADO que coincidió con este al abrirlo —
   * de solo lectura, nunca se escribe sobre esto. Vacío cuando no hay
   * ninguno. Ver ObtenerReferenciaSincronizadaUseCase.
   */
  private referenciaSincronizadaSignal = signal<ConteoItem[]>([]);
  /* Misma referencia, pero fila por captura real (sod_conteo_lectura) — ver referenciaSincronizadaSignal. */
  private referenciaSincronizadaLecturasSignal = signal<ConteoLecturaSesion[]>([]);
  private muestraSet: MuestraSet = { muestraId: null };

  /*
   * Códigos ya resueltos en esta sesión. Escanear el mismo SKU varias veces es
   * lo normal al contar, y cada resolución es una consulta a SQLite.
   *
   * Solo se guardan los que SÍ están en la muestra: un rechazo no se recuerda,
   * así un código que entre a la muestra no queda marcado como inválido. Se
   * vacía al abrir/cerrar la sesión y al pasar de CACHE_MAX entradas, para que
   * no crezca sin límite en un TAG larguísimo.
   */
  private codigosResueltos = new Map<string, CodigoResuelto>();
  private static readonly CACHE_MAX = 500;

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
  readonly referenciaSincronizada = this.referenciaSincronizadaSignal.asReadonly();
  readonly referenciaSincronizadaLecturas = this.referenciaSincronizadaLecturasSignal.asReadonly();
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
  /*
   * `ubicacionSincronizadaId` es el TAG SINCRONIZADO (inmutable) que coincidió
   * al registrar este TAG nuevo — ver ZonaFacade.confirmZona() /
   * UbicacionRepository.insert(). null cuando no hay ninguno.
   */
  async init(
    eventoId: number, ubicacionId: number, operadorId: number, pdaId: number,
    ubicacionSincronizadaId: number | null = null
  ): Promise<void> {
    this.reset();
    this.loadingSignal.set(true);
    try {
      const ronda = await this.asegurarRonda.execute(eventoId);

      /*
       * Aparte del Promise.all crítico a propósito: es de solo lectura —le
       * muestra al operador lo que ya se contó en un TAG viejo sincronizado—,
       * no algo que el conteo nuevo necesite para arrancar. Si rechazara
       * dentro del Promise.all de abajo, tumbaría la sesión entera por un
       * dato que ni siquiera se escribe.
       */
      const referenciaPromise = ubicacionSincronizadaId
        ? this.obtenerReferencia.execute(ronda.id, ubicacionSincronizadaId, operadorId, pdaId)
            .catch((err) => {
              console.error('[ConteoFacade] no se pudo cargar la referencia sincronizada:', err);
              return { items: [], lecturas: [] };
            })
        : Promise.resolve({ items: [], lecturas: [] });

      const [muestraSet, resultado, referencia] = await Promise.all([
        this.loadMuestra.execute(eventoId, ronda.iteracion),
        this.iniciarSesion.execute(ronda.id, ubicacionId, operadorId, pdaId),
        referenciaPromise,
      ]);
      this.muestraSet = muestraSet;
      this.codigosResueltos.clear();
      this.sesionSignal.set(resultado.sesion);
      this.itemsSignal.set(resultado.items);
      this.recoveredSignal.set(resultado.recovered);
      await this.recargarLecturas();
      this.referenciaSincronizadaSignal.set(referencia.items);
      this.referenciaSincronizadaLecturasSignal.set(referencia.lecturas);
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
  async estaEnMuestra(codigoLectura: string): Promise<boolean> {
    return (await this.resolverCodigoMuestra(codigoLectura)) !== null;
  }

  /*
   * Info del producto para el código escaneado (SKU, descripción, código de
   * barras si tiene), o null si el código no está en la muestra. La usa el
   * feedback visual del scan:
   *  - el operador confirma de un vistazo que el producto que se registró es
   *    el que tenía en la mano, no solo que el código coincidió con algún
   *    número;
   *  - y ve el SKU aunque haya escaneado por código de barras, o el código de
   *    barras aunque haya escaneado (o tipeado) el SKU — sin esto, escanear
   *    por código de barras mostraba ese número crudo etiquetado como "SKU",
   *    que no es el SKU real del producto.
   */
  async infoProductoDe(
    codigoLectura: string
  ): Promise<{ sku: string; descripcion: string | null; codigoBarras: string | null; codigoResuelto: string } | null> {
    const resuelto = await this.resolverCodigoMuestra(codigoLectura);
    if (resuelto === null) return null;
    const { info, codigoResuelto } = resuelto;
    return { sku: info.sku, descripcion: info.descripcion, codigoBarras: info.codigoBarras, codigoResuelto };
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

    const resuelto = await this.resolverCodigoMuestra(codigoLectura);

    if (resuelto === null) {
      this.rechazadosSignal.update((prev) =>
        prev.includes(codigoLectura) ? prev : [codigoLectura, ...prev]
      );
      return 'rechazado';
    }

    const codigoResuelto = resuelto.codigoResuelto;
    const productoId = resuelto.info.productoId;

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
    this.referenciaSincronizadaSignal.set([]);
    this.referenciaSincronizadaLecturasSignal.set([]);
    this.muestraSet = { muestraId: null };
    this.codigosResueltos.clear();
  }

  /*
   * Resuelve el código de lectura escaneado contra la muestra de la ronda.
   *
   * La regla (exacto primero, luego sin el cero inicial que a veces pierde
   * Excel/WS) vive en BuscarCodigoMuestraUseCase. Devuelve el código resuelto
   * —el que existe en la muestra— con los datos de su producto, o null si no
   * hay coincidencia.
   */
  private async resolverCodigoMuestra(codigoLectura: string): Promise<CodigoResuelto | null> {
    const clave = codigoLectura.trim().toUpperCase();

    const recordado = this.codigosResueltos.get(clave);
    if (recordado) return recordado;

    const resuelto = await this.buscarCodigo.execute(this.muestraSet.muestraId, codigoLectura);
    if (resuelto) {
      if (this.codigosResueltos.size >= ConteoFacade.CACHE_MAX) this.codigosResueltos.clear();
      this.codigosResueltos.set(clave, resuelto);
    }
    return resuelto;
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
