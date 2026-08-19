import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';

@Injectable({ providedIn: 'root' })
export class FinalizarSesionConteoUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  /*
   * Cierra el TAG para este operador. No lleva pdaId: el operador puede haber
   * cambiado de PDA a mitad del turno, y lo que se cierra es lo que él contó en
   * esa ubicación, venga del equipo que venga.
   */
  async execute(conteoId: number, ubicacionId: number, operadorId: number): Promise<void> {
    return this.conteoRepo.cerrarTag(conteoId, ubicacionId, operadorId);
  }
}
