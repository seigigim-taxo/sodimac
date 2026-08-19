import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { Conteo } from '../../domain/conteo/models/conteo.model';

@Injectable({ providedIn: 'root' })
export class GetUltimaRondaUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  execute(eventoId: number): Promise<Conteo | null> {
    return this.conteoRepo.getUltimaRonda(eventoId);
  }
}
