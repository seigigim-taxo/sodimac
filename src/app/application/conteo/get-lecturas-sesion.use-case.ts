import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoLecturaSesion } from '../../domain/conteo/models/conteo-lectura-sesion.model';

/*
 * Lecturas de la sesión de TAG en curso, una fila por captura. Es la fuente de
 * la lista de la pantalla de conteo. Lectura pura — no modifica nada.
 */
@Injectable({ providedIn: 'root' })
export class GetLecturasSesionUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  async execute(
    conteoId: number, ubicacionId: number, operadorId: number, pdaId: number
  ): Promise<ConteoLecturaSesion[]> {
    return this.conteoRepo.getLecturasSesion(conteoId, ubicacionId, operadorId, pdaId);
  }
}
