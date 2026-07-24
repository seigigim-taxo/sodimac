import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoItem } from '../../domain/conteo/models/conteo-item.model';
import { EstadoConteo } from '../../domain/conteo/models/estado-conteo.model';

@Injectable({ providedIn: 'root' })
export class AdjustConteoItemUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  async execute(
    eventoId: number, ubicacionId: number,
    productoId: number, operadorId: number, pdaId: number,
    delta: number, estado: EstadoConteo
  ): Promise<ConteoItem> {
    if (delta === 0) throw new Error('Delta no puede ser cero');
    if (estado === 'SINCRONIZADO') throw new Error('Un conteo sincronizado no se puede modificar');
    return this.conteoRepo.adjust(eventoId, ubicacionId, productoId, operadorId, pdaId, delta, estado);
  }
}
