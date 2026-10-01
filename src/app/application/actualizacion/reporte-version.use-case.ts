import { Injectable, inject } from '@angular/core';
import { AuthFacade } from '../../state/auth/auth.facade';
import { SucursalFacade } from '../../state/sucursal/sucursal.facade';
import { PdaFacade } from '../../state/pda/pda.facade';
import { ActualizacionFacade } from '../../state/actualizacion/actualizacion.facade';
import { SINCRONIZACION_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { ApiService } from '../../core/http/api.service';
import { TipoReporteVersion, VersionReportPayload, VersionReportResponse } from '../../domain/sincronizacion/models/version-reporte.model';
import { ahoraSql } from '../../shared/utils/fecha.utils';

@Injectable({ providedIn: 'root' })
export class ReporteVersionUseCase {
  private authFacade = inject(AuthFacade);
  private sucursalFacade = inject(SucursalFacade);
  private pdaFacade = inject(PdaFacade);
  private actualizacion = inject(ActualizacionFacade);
  private sincronizacionRepo = inject(SINCRONIZACION_REPOSITORY_TOKEN);
  private api = inject(ApiService);

  async execute(tipo: TipoReporteVersion): Promise<void> {
    const session = this.authFacade.session();
    const tienda = this.sucursalFacade.currentStore();
    const pda = this.pdaFacade.pda();
    const instalada = this.actualizacion.instalada();
    const destino = this.actualizacion.disponible();

    if (!session || !tienda || !pda) return;

    const cargaUid = `VERSION-${tipo}-${pda.codigo}-${Date.now()}`;

    const payload: VersionReportPayload = {
      carga_uid: cargaUid,
      tipo_reporte: tipo,
      version_instalada_codigo: instalada,
      version_instalada_nombre: String(instalada),
      version_destino_codigo: destino?.versionCode ?? instalada,
      version_destino_nombre: destino?.versionName ?? String(instalada),
      operador_rut: session.rutNormalizado,
      operador_correo: session.correo,
      pda_codigo: pda.codigo,
      pda_marca: pda.marca,
      pda_modelo: pda.modelo,
      tienda_codigo: tienda.codigoTienda,
      tienda_nombre: tienda.nombre,
      fecha_reporte: ahoraSql(),
    };

    await this.sincronizacionRepo.guardarSyncVersionReport({
      pdaId: pda.id,
      cargaUid,
      payload,
    });

    try {
      const response = await this.api.post<VersionReportResponse>(
        'sincronizaciones/reporte-version.php',
        payload,
      );
      await this.sincronizacionRepo.marcarEnviado(cargaUid, response.data.id);
    } catch {
      await this.sincronizacionRepo.marcarError(cargaUid, 'Error al enviar reporte de versión');
    }
  }
}
