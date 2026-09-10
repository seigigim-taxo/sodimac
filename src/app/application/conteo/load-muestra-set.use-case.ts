import { Injectable, inject } from '@angular/core';
import { MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra.repository';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra-detalle.repository';

export interface MuestraSet {
  skuMap: Map<string, number>; // codigo_lectura (uppercase) → productoId
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
    const skuMap = new Map<string, number>();
    for (const c of codigos) {
      skuMap.set(c.codigoLectura, c.productoId);
    }

    return { skuMap };
  }
}
