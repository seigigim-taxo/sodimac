import { Injectable, inject } from '@angular/core';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';
import { Evento } from '../../domain/evento/models/evento.model';

@Injectable({ providedIn: 'root' })
export class GetEventosBySucursalUseCase {
  private eventoRepo = inject(EVENTO_REPOSITORY_TOKEN);

  async execute(sucursalId: number): Promise<Evento[]> {
    return this.eventoRepo.getBySucursal(sucursalId);
  }
}
