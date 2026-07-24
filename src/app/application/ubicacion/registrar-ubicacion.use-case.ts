import { Injectable, inject } from '@angular/core';
import { UBICACION_REPOSITORY_TOKEN } from '../../domain/ubicacion/repositories/ubicacion.repository';

@Injectable({ providedIn: 'root' })
export class RegistrarUbicacionUseCase {
  private ubicacionRepo = inject(UBICACION_REPOSITORY_TOKEN);

  async execute(zonaId: number, tag: string): Promise<number> {
    if (!tag.trim()) throw new Error('El TAG no puede estar vacío');
    if (zonaId <= 0)  throw new Error('Zona inválida');
    return this.ubicacionRepo.insert(zonaId, tag);
  }
}
