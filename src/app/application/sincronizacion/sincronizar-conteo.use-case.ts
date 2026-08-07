import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { SINCRONIZACION_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
import { ApiService } from '../../core/http/api.service';
import { TagFinalizadoResponse } from '../../domain/sincronizacion/models/tag-finalizado.model';

@Injectable({ providedIn: 'root' })
export class SincronizarConteoUseCase {
  private conteoRepo         = inject(CONTEO_REPOSITORY_TOKEN);
  private sincronizacionRepo = inject(SINCRONIZACION_REPOSITORY_TOKEN);
  private api                = inject(ApiService);

  async execute(conteo: ConteoResumen): Promise<void> {
    if (conteo.estado !== 'FINALIZADO') {
      throw new Error('Solo un conteo finalizado se puede sincronizar');
    }

    const payload = await this.conteoRepo.getPayloadSincronizacion(conteo);

    const response = await this.api.post<TagFinalizadoResponse>(
      'sincronizaciones/tag-finalizado.php',
      payload,
    );

    await this.conteoRepo.marcarSincronizado(
      conteo.conteoId, conteo.ubicacionId, conteo.operadorId, conteo.pdaId,
    );
    await this.sincronizacionRepo.registrarCarga(
      conteo.eventoId, conteo.pdaId, response.total_productos,
    );
  }
}
