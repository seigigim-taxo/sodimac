import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoItem } from '../../domain/conteo/models/conteo-item.model';

/*
 * Suma o resta unidades a UNA lectura de la sesión en curso. El guard de estado
 * (solo EN_CURSO) vive en el repositorio, que es donde se puede resolver el
 * detalle de la lectura sin volver a pasar la tupla completa.
 */
@Injectable({ providedIn: 'root' })
export class AdjustConteoLecturaUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  async execute(lecturaId: number, delta: number): Promise<ConteoItem> {
    if (delta === 0) throw new Error('Delta no puede ser cero');
    return this.conteoRepo.adjustLectura(lecturaId, delta);
  }
}
