import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { EstadoConteo } from '../../domain/conteo/models/estado-conteo.model';

@Injectable({ providedIn: 'root' })
export class DeleteConteoSesionUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  async execute(
    conteoId: number, ubicacionId: number, operadorId: number, pdaId: number, estado: EstadoConteo
  ): Promise<void> {
    return this.conteoRepo.deleteSesion(conteoId, ubicacionId, operadorId, pdaId, estado);
  }
}
