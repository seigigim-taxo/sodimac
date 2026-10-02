import { Injectable, inject } from '@angular/core';
import { MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra.repository';

export interface InfoProductoMuestra {
  productoId: number;
  descripcion: string | null;
  /*
   * SKU y código de barras del producto — no de la fila de codigo_lectura que
   * hizo match. El feedback visual del scan los usa para mostrar el código que
   * NO se usó para escanear, cuando el producto lo tiene (ver
   * ConteoFacade.infoProductoDe()).
   */
  sku: string;
  codigoBarras: string | null;
}

/*
 * Con qué muestra se valida lo que se escanea. Es solo el id: los códigos ya
 * NO se cargan acá.
 *
 * Antes se bajaba la muestra completa a un Map (código → producto) cada vez
 * que se abría un TAG. Con una muestra de 23.000 productos son 68.000 códigos
 * y la pantalla tardaba ~5 s en dejar escanear. Ahora cada escaneo consulta
 * el código puntual (ver MuestraDetalleRepository.buscarCodigos).
 */
export interface MuestraSet {
  /* null cuando la ronda no tiene muestra: ningún código es válido. */
  muestraId: number | null;
}

@Injectable({ providedIn: 'root' })
export class LoadMuestraSetUseCase {
  private muestraRepo = inject(MUESTRA_REPOSITORY_TOKEN);

  async execute(eventoId: number, iteracion: number): Promise<MuestraSet> {
    const muestra = await this.muestraRepo.getByEventoIteracion(eventoId, iteracion);
    return { muestraId: muestra?.id ?? null };
  }
}
