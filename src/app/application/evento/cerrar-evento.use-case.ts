import { Injectable, inject } from '@angular/core';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';

@Injectable({ providedIn: 'root' })
export class CerrarEventoUseCase {
  private eventoRepo = inject(EVENTO_REPOSITORY_TOKEN);

  async execute(eventoId: number): Promise<void> {
    await this.eventoRepo.updateEstado(eventoId, 'CERRADO');
  }
}
