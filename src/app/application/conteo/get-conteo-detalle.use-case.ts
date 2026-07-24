import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoItem } from '../../domain/conteo/models/conteo-item.model';
import { EstadoConteo } from '../../domain/conteo/models/estado-conteo.model';

@Injectable({ providedIn: 'root' })
export class GetConteoDetalleUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  async execute(
    eventoId: number, ubicacionId: number, operadorId: number, pdaId: number, estado: EstadoConteo
  ): Promise<ConteoItem[]> {
    return this.conteoRepo.getBySesion(eventoId, ubicacionId, operadorId, pdaId, estado);
  }
}
