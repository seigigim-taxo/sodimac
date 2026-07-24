import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { SesionConteo } from '../../domain/conteo/models/sesion-conteo.model';
import { ConteoItem } from '../../domain/conteo/models/conteo-item.model';

export interface IniciarSesionResult {
  sesion:    SesionConteo;
  items:     ConteoItem[];
  recovered: boolean;
}

@Injectable({ providedIn: 'root' })
export class IniciarSesionConteoUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  /*
   * El estado vive en sod_conteo.estado — no hay meta externa. Si existen
   * filas EN_CURSO para la tupla, la sesión se recupera con ellas; si no,
   * la sesión parte vacía (las filas se crearán con el primer scan).
   */
  async execute(
    eventoId: number, ubicacionId: number, operadorId: number, pdaId: number
  ): Promise<IniciarSesionResult> {
    const items = await this.conteoRepo.getBySesion(eventoId, ubicacionId, operadorId, pdaId, 'EN_CURSO');
    return {
      sesion:    { eventoId, ubicacionId, operadorId, pdaId },
      items,
      recovered: items.length > 0,
    };
  }
}
