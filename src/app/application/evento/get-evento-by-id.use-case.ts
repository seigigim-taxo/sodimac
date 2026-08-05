import { Injectable, inject } from '@angular/core';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';
import { Evento } from '../../domain/evento/models/evento.model';

@Injectable({ providedIn: 'root' })
export class GetEventoByIdUseCase {
  private eventoRepo = inject(EVENTO_REPOSITORY_TOKEN);

  execute(id: number): Promise<Evento | null> {
    return this.eventoRepo.getById(id);
  }
}
