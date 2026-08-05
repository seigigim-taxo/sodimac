import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';

@Injectable({ providedIn: 'root' })
export class GetIteracionActivaUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  /*
   * Ronda en curso del evento. Se deriva de sod_conteo porque es la única tabla
   * que guarda la iteración: no existe un puntero a "la ronda activa".
   */
  execute(eventoId: number): Promise<number> {
    return this.conteoRepo.getIteracionActiva(eventoId);
  }
}
