import { Injectable, inject } from '@angular/core';
import { MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra.repository';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra-detalle.repository';

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

export interface MuestraSet {
  skuMap: Map<string, InfoProductoMuestra>; // codigo_lectura (uppercase) → producto
}

@Injectable({ providedIn: 'root' })
export class LoadMuestraSetUseCase {
  private muestraRepo = inject(MUESTRA_REPOSITORY_TOKEN);
  private detalleRepo = inject(MUESTRA_DETALLE_REPOSITORY_TOKEN);

  async execute(eventoId: number, iteracion: number): Promise<MuestraSet> {
    const muestra = await this.muestraRepo.getByEventoIteracion(eventoId, iteracion);
    if (!muestra) {
      return { skuMap: new Map() };
    }

    const codigos = await this.detalleRepo.getCodigosByMuestra(muestra.id);
    const skuMap = new Map<string, InfoProductoMuestra>();
    for (const c of codigos) {
      skuMap.set(c.codigoLectura, {
        productoId: c.productoId,
        descripcion: c.descripcion,
        sku: c.sku,
        codigoBarras: c.codigoBarras,
      });
    }

    return { skuMap };
  }
}
