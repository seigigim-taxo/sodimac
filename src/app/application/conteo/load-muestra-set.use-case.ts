import { Injectable, inject } from '@angular/core';
import { MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra.repository';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra-detalle.repository';

export interface MuestraSet {
  skuMap: Map<string, number>; // sku (uppercase) → productoId
}

@Injectable({ providedIn: 'root' })
export class LoadMuestraSetUseCase {
  private muestraRepo = inject(MUESTRA_REPOSITORY_TOKEN);
  private detalleRepo = inject(MUESTRA_DETALLE_REPOSITORY_TOKEN);

  async execute(eventoId: number): Promise<MuestraSet> {
    const muestra = await this.muestraRepo.getByEvento(eventoId);
    if (!muestra) return { skuMap: new Map() };

    const detalles = await this.detalleRepo.getByMuestra(muestra.id);
    const skuMap = new Map<string, number>();
    for (const d of detalles) {
      // Normaliza a mayúsculas: scan.component ya emite el SKU en uppercase,
      // así el lookup no falla si el dato en sod_producto tiene minúsculas.
      skuMap.set(d.sku.toUpperCase(), d.productoId);
    }
    return { skuMap };
  }
}
