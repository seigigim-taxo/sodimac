import { Injectable, inject } from '@angular/core';
import { SINCRONIZACION_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { TagFinalizadoPayload, TagFinalizadoResponse } from '../../domain/sincronizacion/models/tag-finalizado.model';
import { ApiService } from '../../core/http/api.service';

export interface ResultadoEnviarPendientes {
  enviados: number;
  conError: number;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class EnviarPendientesUseCase {
  private sincronizacionRepo = inject(SINCRONIZACION_REPOSITORY_TOKEN);
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);
  private api = inject(ApiService);

  async execute(): Promise<ResultadoEnviarPendientes> {
    const pendientes = await this.sincronizacionRepo.listarPendientes();
    let enviados = 0;
    let conError = 0;

    for (const item of pendientes) {
      if (!item.payloadJson || !item.cargaUid) {
        conError++;
        continue;
      }

      try {
        const payload: TagFinalizadoPayload = JSON.parse(item.payloadJson);
        const response = await this.api.post<TagFinalizadoResponse>(
          'sincronizaciones/tag-finalizado.php',
          payload,
        );

        await this.sincronizacionRepo.marcarEnviado(item.cargaUid, response.total_productos);

        if (item.perfil === 'OPERADOR' && item.conteoId && item.ubicacionId && item.operadorId && item.pdaId) {
          await this.conteoRepo.marcarSincronizado(item.conteoId, item.ubicacionId, item.operadorId, item.pdaId);
        }

        enviados++;
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : 'Error al enviar';
        await this.sincronizacionRepo.marcarError(item.cargaUid, mensaje);
        conError++;
      }
    }

    return { enviados, conError, total: pendientes.length };
  }
}
