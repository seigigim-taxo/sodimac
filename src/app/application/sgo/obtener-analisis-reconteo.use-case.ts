import { Injectable, inject } from '@angular/core';
import { SGO_SYNC_REPOSITORY_TOKEN } from '../../domain/sgo/repositories/sgo-sync.repository';

export interface ResultadoAnalisisSgo {
  requiereReconteo: boolean;
  iteracion?: number;
  skusARecontar?: number;
}

@Injectable({ providedIn: 'root' })
export class ObtenerAnalisisReconteoUseCase {
  private sgoSync = inject(SGO_SYNC_REPOSITORY_TOKEN);

  async execute(eventoId: number, iteracionActual: number): Promise<ResultadoAnalisisSgo> {
    const resultado = await this.sgoSync.obtenerAnalisisReconteo(eventoId, iteracionActual);
    
    return {
      requiereReconteo: resultado.requiereReconteo,
      iteracion: resultado.iteracion,
      skusARecontar: resultado.skusARecontar,
    };
  }
}
