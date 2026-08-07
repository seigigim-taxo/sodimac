import { Injectable, inject } from '@angular/core';
import { SGO_SYNC_REPOSITORY_TOKEN } from '../../domain/sgo/repositories/sgo-sync.repository';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';

@Injectable({ providedIn: 'root' })
export class SincronizarConteoConSgoUseCase {
  private sgoSync = inject(SGO_SYNC_REPOSITORY_TOKEN);

  async execute(conteo: ConteoResumen): Promise<void> {
    if (conteo.estado !== 'FINALIZADO') {
      throw new Error('Solo un conteo finalizado se puede sincronizar con el SGO');
    }

    const resultado = await this.sgoSync.sincronizarConteo(conteo.eventoId, {
      conteoId: conteo.conteoId,
      ubicacionId: conteo.ubicacionId,
      operadorId: conteo.operadorId,
      pdaId: conteo.pdaId,
      totalProductos: conteo.totalProductos,
    });

    if (!resultado.success) {
      throw new Error(resultado.mensaje ?? 'Error al sincronizar con el SGO');
    }
  }
}
