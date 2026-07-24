import { Injectable, inject } from '@angular/core';
import { SUCURSAL_REPOSITORY_TOKEN } from '../../domain/sucursal/repositories/sucursal.repository';
import { Sucursal } from '../../domain/sucursal/models/sucursal.model';

@Injectable({ providedIn: 'root' })
export class GetSucursalesUseCase {
  private sucursalRepo = inject(SUCURSAL_REPOSITORY_TOKEN);

  async execute(userId: number): Promise<Sucursal[]> {
    return this.sucursalRepo.getByUsuario(userId);
  }
}
