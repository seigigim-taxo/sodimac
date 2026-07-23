import { Injectable, inject } from '@angular/core';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra-detalle.repository';
import { MuestraDetalle } from '../../domain/muestra/models/muestra-detalle.model';

@Injectable({ providedIn: 'root' })
export class GetMuestraDetalleByMuestraUseCase {
  private detalleRepo = inject(MUESTRA_DETALLE_REPOSITORY_TOKEN);

  async execute(muestraId: number): Promise<MuestraDetalle[]> {
    return this.detalleRepo.getByMuestra(muestraId);
  }
}
