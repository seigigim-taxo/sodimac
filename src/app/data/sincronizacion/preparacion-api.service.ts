import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../core/http/api.service';
import { DatosPreparacion, PreparacionRequest } from '../../domain/sincronizacion/models/preparacion.model';
import { PreparacionApiRepository } from '../../domain/sincronizacion/repositories/preparacion-api.repository';
import { parsearPreparacion } from './preparacion.parser';
import { environment } from '../../../environments/environment';
import { hoySql } from '../../shared/utils/fecha.utils';

const PREPARACION_TIMEOUT_MS = 300_000;

@Injectable({ providedIn: 'root' })
export class PreparacionApiService implements PreparacionApiRepository {
  private api = inject(ApiService);

  /*
   * El `unknown` es deliberado: castear la respuesta a una interfaz no valida
   * nada en runtime. Quien decide si el JSON sirve es el parser.
   *
   * El endpoint es configurable por environment: development usa
   * preparacion_dev.php, mockup usa preparacion_mockup.php,
   * y producción usa preparacion.php.
   */
  async preparar(request: PreparacionRequest): Promise<DatosPreparacion> {
    const endpoint = environment.preparacionEndpoint ?? 'sincronizaciones/preparacion.php';
    const data = await this.api.post<unknown>(endpoint, this.conVentanaLocal(request), { timeoutMs: PREPARACION_TIMEOUT_MS });
    return parsearPreparacion(data);
  }

  /*
   * Agrega `fecha_local` al body SOLO cuando environment.enviarVentanaLocal
   * está en true (desarrollo). preparacion_dev.php la usa en vez de su propio
   * reloj para decidir la ventana hoy/mañana — sirve para alinear pruebas con
   * agendas ya sembradas en fechas fijas, sin esperar al día real.
   *
   * Va acá y no en cada llamador: así ningún caso de uso tiene que acordarse
   * de un campo que en producción ni siquiera existe, y preparacion.php —el
   * endpoint real, no tocado— tampoco lo lee aunque llegara.
   */
  private conVentanaLocal(request: PreparacionRequest): PreparacionRequest & { fecha_local?: string } {
    if (!environment.enviarVentanaLocal) return request;
    return { ...request, fecha_local: hoySql() };
  }
}
