import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';

@Injectable({ providedIn: 'root' })
export class GetConteosUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  async execute(operadorId: number, pdaId: number): Promise<ConteoResumen[]> {
    return this.conteoRepo.getResumenes(operadorId, pdaId);
  }
}
