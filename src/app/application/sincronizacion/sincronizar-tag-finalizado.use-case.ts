import { Injectable, inject } from '@angular/core';
import { SINCRONIZACION_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { GuardarSyncTagInput, PerfilSync } from '../../domain/sincronizacion/models/sincronizacion-sync.model';
import { TagFinalizadoPayload, TagFinalizadoResponse } from '../../domain/sincronizacion/models/tag-finalizado.model';
import { ApiService } from '../../core/http/api.service';

export interface ResultadoSyncTag {
  ok: boolean;
  enviado: boolean;
  error?: string;
}

/*
 * tag-finalizado.php llama al SP del SGO una vez POR CADA línea del TAG,
 * secuencialmente, dentro del mismo request — no en paralelo ni en lote. Con
 * una muestra de 40 SKUs son 40 idas y vueltas a la base del SGO antes de que
 * el servidor pueda responder. El timeout general de la API (30s, pensado
 * para endpoints livianos) se quedaba corto para ese caso: el cliente cortaba
 * la conexión y daba el TAG por caído, pero el servidor seguía procesando y a
 * veces terminaba de guardarlo igual — el operador veía "no se envió" de un
 * TAG que en realidad sí había llegado.
 */
export const TIMEOUT_TAG_FINALIZADO_MS = 120_000;

@Injectable({ providedIn: 'root' })
export class SincronizarTagFinalizadoUseCase {
  private sincronizacionRepo = inject(SINCRONIZACION_REPOSITORY_TOKEN);
  private api = inject(ApiService);

  /**
   * Guarda el payload en sod_sincronizacion como PENDIENTE, intenta enviarlo
   * al WS y actualiza el estado según el resultado.
   */
  async execute(input: GuardarSyncTagInput): Promise<ResultadoSyncTag> {
    await this.sincronizacionRepo.guardarSyncTag(input);

    try {
      const response = await this.api.post<TagFinalizadoResponse>(
        'sincronizaciones/tag-finalizado.php',
        input.payload,
        { timeoutMs: TIMEOUT_TAG_FINALIZADO_MS },
      );
      await this.sincronizacionRepo.marcarEnviado(input.cargaUid, response.total_productos);
      return { ok: true, enviado: true };
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error al enviar conteo al servidor';
      await this.sincronizacionRepo.marcarError(input.cargaUid, mensaje);
      return { ok: false, enviado: false, error: mensaje };
    }
  }
}
