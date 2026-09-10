import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';

/*
 * Borra UNA lectura de la sesión en curso. Si su detalle queda sin capturas, el
 * repositorio lo borra también. El guard de estado (solo EN_CURSO) vive en el
 * repositorio.
 */
@Injectable({ providedIn: 'root' })
export class DeleteConteoLecturaUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  async execute(lecturaId: number): Promise<void> {
    return this.conteoRepo.deleteLectura(lecturaId);
  }
}
