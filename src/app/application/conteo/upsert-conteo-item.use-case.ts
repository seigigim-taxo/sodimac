import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoItem } from '../../domain/conteo/models/conteo-item.model';

@Injectable({ providedIn: 'root' })
export class UpsertConteoItemUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  async execute(
    conteoId: number, ubicacionId: number,
    productoId: number, operadorId: number, pdaId: number,
    cantidad: number
  ): Promise<ConteoItem> {
    /*
     * Cero es una cantidad válida: el operador declara que del SKU no hay
     * unidades (vendido, despachado, o corrección de un conteo anterior).
     * La confirmación de que no fue un error de digitación la pide la UI
     * antes de llegar acá; lo que se rechaza son negativos y no-números.
     */
    if (cantidad < 0 || !Number.isFinite(cantidad)) {
      throw new Error('La cantidad no puede ser negativa');
    }
    return this.conteoRepo.upsert(conteoId, ubicacionId, productoId, operadorId, pdaId, cantidad);
  }
}
