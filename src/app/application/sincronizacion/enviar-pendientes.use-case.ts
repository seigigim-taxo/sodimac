import { Injectable, inject } from '@angular/core';
import { SINCRONIZACION_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { TagFinalizadoPayloadAlmacenado, TagFinalizadoResponse } from '../../domain/sincronizacion/models/tag-finalizado.model';
import { ValidacionAnalistaPayloadAlmacenado, ValidacionAnalistaResponse } from '../../domain/sincronizacion/models/validacion-analista.model';
import { VersionReportPayload, VersionReportResponse } from '../../domain/sincronizacion/models/version-reporte.model';
import { ApiService } from '../../core/http/api.service';
import { environment } from '../../../environments/environment';

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
        if (item.operacion === 'VALIDACION_OPERACIONAL') {
          const payload: ValidacionAnalistaPayloadAlmacenado = JSON.parse(item.payloadJson);
          const response = await this.api.post<ValidacionAnalistaResponse>(
            'sincronizaciones/validacion-analista.php',
            payload,
          );
          await this.sincronizacionRepo.marcarEnviado(item.cargaUid, response.total_productos);
        } else if (item.operacion === 'VERSION_REPORTE') {
          const payload: VersionReportPayload = JSON.parse(item.payloadJson);
          /*
           * api.post<T> ya devuelve el contenido de `data`, no el envoltorio
           * {status,msg,data}. Tipar con VersionReportResponse (el envoltorio)
           * hacía que response.data fuera undefined y marcarEnviado tirara
           * "Cannot read properties of undefined (reading 'id')" — el server
           * respondía 200 y la app lo contaba igual como error.
           */
          const response = await this.api.post<VersionReportResponse['data']>(
            'sincronizaciones/reporte-version.php',
            payload,
          );
          await this.sincronizacionRepo.marcarEnviado(item.cargaUid, response.id);
        } else {
          const payload: TagFinalizadoPayloadAlmacenado = JSON.parse(item.payloadJson);
          const response = await this.api.post<TagFinalizadoResponse>(
            environment.tagFinalizadoEndpoint,
            payload,
          );
          await this.sincronizacionRepo.marcarEnviado(item.cargaUid, response.total_productos);

          if (item.perfil === 'OPERADOR' && item.conteoId && item.ubicacionId && item.operadorId && item.pdaId) {
            await this.conteoRepo.marcarSincronizado(item.conteoId, item.ubicacionId, item.operadorId, item.pdaId);
          }
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
