import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../core/http/api.service';
import { DatosPreparacion, PreparacionRequest } from '../../domain/sincronizacion/models/preparacion.model';
import { PreparacionApiRepository } from '../../domain/sincronizacion/repositories/preparacion-api.repository';
import { parsearPreparacion } from './preparacion.parser';
import { environment } from '../../../environments/environment';

const PREPARACION_TIMEOUT_MS = 300_000;

@Injectable({ providedIn: 'root' })
export class PreparacionApiService implements PreparacionApiRepository {
  private api = inject(ApiService);

  /*
   * El `unknown` es deliberado: castear la respuesta a una interfaz no valida
   * nada en runtime. Quien decide si el JSON sirve es el parser.
   *
   * El endpoint es configurable por environment: develop_ws usa
   * preparacion_ws.php (mock), los demás usan preparacion.php (real).
   */
  async preparar(request: PreparacionRequest): Promise<DatosPreparacion> {
    const endpoint = environment.preparacionEndpoint ?? 'sincronizaciones/preparacion.php';
    const data = await this.api.post<unknown>(endpoint, request, { timeoutMs: PREPARACION_TIMEOUT_MS });
    return parsearPreparacion(data);
  }
}
