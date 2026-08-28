import { Injectable, inject } from '@angular/core';
import { SINCRONIZACION_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { GuardarSyncValidacionInput } from '../../domain/sincronizacion/models/sincronizacion-sync.model';
import { ValidacionAnalistaResponse } from '../../domain/sincronizacion/models/validacion-analista.model';
import { ApiService } from '../../core/http/api.service';

export interface ResultadoValidacionAnalista {
  ok: boolean;
  enviado: boolean;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class SincronizarValidacionAnalistaUseCase {
  private sincronizacionRepo = inject(SINCRONIZACION_REPOSITORY_TOKEN);
  private api = inject(ApiService);

  async execute(input: GuardarSyncValidacionInput): Promise<ResultadoValidacionAnalista> {
    await this.sincronizacionRepo.guardarSyncValidacion(input);

    try {
      const response = await this.api.post<ValidacionAnalistaResponse>(
        'sincronizaciones/validacion-analista.php',
        input.payload,
      );
      await this.sincronizacionRepo.marcarEnviado(input.cargaUid, response.total_productos);
      return { ok: true, enviado: true };
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error al enviar validacion al servidor';
      await this.sincronizacionRepo.marcarError(input.cargaUid, mensaje);
      return { ok: false, enviado: false, error: mensaje };
    }
  }
}
