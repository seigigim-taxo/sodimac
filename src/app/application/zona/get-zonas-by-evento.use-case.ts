import { Injectable, inject } from '@angular/core';
import { ZONA_REPOSITORY_TOKEN } from '../../domain/zona/repositories/zona.repository';
import { Zona } from '../../domain/zona/models/zona.model';

@Injectable({ providedIn: 'root' })
export class GetZonasByEventoUseCase {
  private zonaRepo = inject(ZONA_REPOSITORY_TOKEN);

  async execute(eventoId: number, operadorId: number): Promise<Zona[]> {
    return this.zonaRepo.getByEventoAndOperador(eventoId, operadorId);
  }
}
