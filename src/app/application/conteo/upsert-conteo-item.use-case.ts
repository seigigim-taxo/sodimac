import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoItem } from '../../domain/conteo/models/conteo-item.model';

@Injectable({ providedIn: 'root' })
export class UpsertConteoItemUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  async execute(
    eventoId: number, ubicacionId: number,
    productoId: number, operadorId: number, pdaId: number,
    cantidad: number
  ): Promise<ConteoItem> {
    if (cantidad < 1 || !Number.isFinite(cantidad)) {
      throw new Error('La cantidad debe ser mayor o igual a 1');
    }
    return this.conteoRepo.upsert(eventoId, ubicacionId, productoId, operadorId, pdaId, cantidad);
  }
}
