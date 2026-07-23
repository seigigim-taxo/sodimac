import { Injectable, inject } from '@angular/core';
import { MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra.repository';
import { Muestra } from '../../domain/muestra/models/muestra.model';

@Injectable({ providedIn: 'root' })
export class GetMuestraByEventoUseCase {
  private muestraRepo = inject(MUESTRA_REPOSITORY_TOKEN);

  async execute(eventoId: number): Promise<Muestra | null> {
    return this.muestraRepo.getByEvento(eventoId);
  }
}
