import { Injectable, inject } from '@angular/core';
import { ZONA_REPOSITORY_TOKEN } from '../../domain/zona/repositories/zona.repository';
import { Zona } from '../../domain/zona/models/zona.model';

@Injectable({ providedIn: 'root' })
export class GetZonasBySucursalUseCase {
  private zonaRepo = inject(ZONA_REPOSITORY_TOKEN);

  async execute(sucursalId: number): Promise<Zona[]> {
    return this.zonaRepo.getBySucursal(sucursalId);
  }
}
