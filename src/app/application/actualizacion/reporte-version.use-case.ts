import { Injectable, inject } from '@angular/core';
import { AuthFacade } from '../../state/auth/auth.facade';
import { SucursalFacade } from '../../state/sucursal/sucursal.facade';
import { PdaFacade } from '../../state/pda/pda.facade';
import { ActualizacionFacade } from '../../state/actualizacion/actualizacion.facade';
import { SINCRONIZACION_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { ApiService } from '../../core/http/api.service';
import { AppInfoService } from '../../core/app-info.service';
import { TipoReporteVersion, VersionReportPayload, VersionReportResponse } from '../../domain/sincronizacion/models/version-reporte.model';
import { ahoraSql } from '../../shared/utils/fecha.utils';

/*
 * Devuelve true solo si el servidor acepto el reporte.
 *
 * Quien confirma la instalacion usa ese resultado para guardar la version
 * confirmada: si se guardara igual cuando el envio fallo, el reporte se
 * pierde para siempre y en el proximo inicio ya no hay cambio que detectar.
 */
@Injectable({ providedIn: 'root' })
export class ReporteVersionUseCase {
  private authFacade = inject(AuthFacade);
  private sucursalFacade = inject(SucursalFacade);
  private pdaFacade = inject(PdaFacade);
  private actualizacion = inject(ActualizacionFacade);
  private sincronizacionRepo = inject(SINCRONIZACION_REPOSITORY_TOKEN);
  private api = inject(ApiService);
  private appInfo = inject(AppInfoService);

  async execute(tipo: TipoReporteVersion): Promise<boolean> {
    const session = this.authFacade.session();
    const tienda = this.sucursalFacade.currentStore();
    const pda = this.pdaFacade.pda();

    if (!session || !tienda || !pda) return false;

    /*
     * La version instalada se lee del sistema y NO del facade: la
     * confirmacion corre al entrar a Inicio en paralelo con la busqueda de
     * actualizacion, y el facade recien se llena cuando esa busqueda
     * termina. Leyendolo aca del facade el payload salia con instalada 0 y
     * el servidor lo rechazaba.
     *
     * 0 significa que Android no contesto: sin eso no hay reporte posible
     * (el servidor exige ambos codigos > 0).
     */
    const { codigo, nombre } = await this.appInfo.version();
    if (codigo <= 0) return false;

    /*
     * DESTINO SEGUN EL TIPO:
     *
     * - DETECCION: la version que el servidor ofrece — todavia no esta
     *   instalada.
     * - CONFIRMACION_INSTALACION: la recien instalada. Apuntar a la oferta
     *   seria reportar como confirmada una version que no se instalo, y la
     *   dedup del servidor filtra por (pda, tipo, destino): cada version
     *   instalada tiene que dejar su propia fila.
     */
    const oferta = tipo === 'DETECCION' ? this.actualizacion.disponible() : null;
    if (tipo === 'DETECCION' && !oferta) return false;

    const cargaUid = `VERSION-${tipo}-${pda.codigo}-${Date.now()}`;

    const payload: VersionReportPayload = {
      carga_uid: cargaUid,
      tipo_reporte: tipo,
      version_instalada_codigo: codigo,
      version_instalada_nombre: nombre,
      version_destino_codigo: oferta?.versionCode ?? codigo,
      version_destino_nombre: oferta?.versionName ?? nombre,
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
      await this.sincronizacionRepo.marcarEnviado(cargaUid, response.id);
      return true;
    } catch {
      await this.sincronizacionRepo.marcarError(cargaUid, 'Error al enviar reporte de versión');
      return false;
    }
  }
}
