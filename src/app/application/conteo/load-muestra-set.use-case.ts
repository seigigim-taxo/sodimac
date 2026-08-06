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
    if (!muestra) {
      console.log('[LoadMuestraSet] No hay muestra para evento', eventoId);
      return { skuMap: new Map() };
    }
    
    console.log('[LoadMuestraSet] Muestra encontrada:', muestra.id, muestra.codigoMuestra);

    const detalles = await this.detalleRepo.getByMuestra(muestra.id);
    const skuMap = new Map<string, number>();
    for (const d of detalles) {
      // Normaliza a mayúsculas: scan.component ya emite el SKU en uppercase,
      // así el lookup no falla si el dato en sod_producto tiene minúsculas.
      const skuNormalizado = d.sku.trim().toUpperCase();
      skuMap.set(skuNormalizado, d.productoId);
      console.log('[LoadMuestraSet] Agregando al mapa:', skuNormalizado, '→', d.productoId);
    }
    
    console.log('[LoadMuestraSet] Mapa final con', skuMap.size, 'SKUs');
    console.log('[LoadMuestraSet] SKUs en mapa:', Array.from(skuMap.keys()));
    console.log('[LoadMuestraSet] Mapa completo (SKU → productoId):');
    console.table(Array.from(skuMap.entries()).map(([sku, productoId]) => ({ sku, productoId })));
    
    return { skuMap };
  }
}
