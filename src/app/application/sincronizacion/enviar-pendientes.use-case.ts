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

export interface OpcionesEnviarPendientes {
  /*
   * Solo las filas VERSION_REPORTE.
   *
   * El reintento automático de Inicio usa esto: los reportes de versión
   * se reintentan solos porque nadie los mira, pero un TAG pendiente o una
   * validación no se mandan a escondidas — su envío sigue siendo a pulso
   * desde el menú, como hasta ahora.
   */
  soloVersiones?: boolean;
}

@Injectable({ providedIn: 'root' })
export class EnviarPendientesUseCase {
  private sincronizacionRepo = inject(SINCRONIZACION_REPOSITORY_TOKEN);
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);
  private api = inject(ApiService);

  async execute(opciones?: OpcionesEnviarPendientes): Promise<ResultadoEnviarPendientes> {
    const pendientes = await this.sincronizacionRepo.listarPendientes();
    const aEnviar = opciones?.soloVersiones
      ? pendientes.filter((item) => item.operacion === 'VERSION_REPORTE')
      : pendientes;
    let enviados = 0;
    let conError = 0;

    for (const item of aEnviar) {
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
          const response = await this.api.post<VersionReportResponse>(
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

    return { enviados, conError, total: aEnviar.length };
  }
}
