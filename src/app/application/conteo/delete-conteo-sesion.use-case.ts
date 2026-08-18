import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { EstadoConteo } from '../../domain/conteo/models/estado-conteo.model';

/*
 * Borra lo contado en un TAG. `conteoId` es la RONDA a la que pertenecen las
 * líneas, no el evento: son ids distintos y ambos son números, así que el
 * compilador no avisa si se confunden.
 */
@Injectable({ providedIn: 'root' })
export class DeleteConteoSesionUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  async execute(
    conteoId: number, ubicacionId: number, operadorId: number, pdaId: number, estado: EstadoConteo
  ): Promise<void> {
    /*
     * Un TAG sincronizado ya viajó al servidor: borrarlo acá dejaría a la PDA
     * sin registro de algo que el SGO sí tiene. La pantalla no ofrece la acción
     * en ese estado, pero la regla vive acá y no en la vista.
     */
    if (estado === 'SINCRONIZADO') {
      throw new Error('Este TAG ya se sincronizó y no se puede eliminar.');
    }

    return this.conteoRepo.deleteSesion(conteoId, ubicacionId, operadorId, pdaId, estado);
  }
}
