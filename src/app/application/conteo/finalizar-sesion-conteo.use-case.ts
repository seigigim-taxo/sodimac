import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';

@Injectable({ providedIn: 'root' })
export class FinalizarSesionConteoUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  async execute(
    eventoId: number, ubicacionId: number, operadorId: number, pdaId: number
  ): Promise<void> {
    return this.conteoRepo.finalizarSesion(eventoId, ubicacionId, operadorId, pdaId);
  }
}
