import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { EstadoConteo } from '../../domain/conteo/models/estado-conteo.model';

@Injectable({ providedIn: 'root' })
export class DeleteConteoItemUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  async execute(
    eventoId: number, ubicacionId: number,
    productoId: number, operadorId: number, pdaId: number,
    estado: EstadoConteo
  ): Promise<void> {
    if (estado === 'SINCRONIZADO') throw new Error('Un conteo sincronizado no se puede modificar');
    return this.conteoRepo.delete(eventoId, ubicacionId, productoId, operadorId, pdaId, estado);
  }
}
