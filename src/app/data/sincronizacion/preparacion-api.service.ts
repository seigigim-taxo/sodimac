import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../core/http/api.service';
import { DatosPreparacion, PreparacionRequest } from '../../domain/sincronizacion/models/preparacion.model';
import { PreparacionApiRepository } from '../../domain/sincronizacion/repositories/preparacion-api.repository';
import { parsearPreparacion } from './preparacion.parser';

@Injectable({ providedIn: 'root' })
export class PreparacionApiService implements PreparacionApiRepository {
  private api = inject(ApiService);

  /*
   * El `unknown` es deliberado: castear la respuesta a una interfaz no valida
   * nada en runtime. Quien decide si el JSON sirve es el parser.
   */
  async preparar(request: PreparacionRequest): Promise<DatosPreparacion> {
    const data = await this.api.post<unknown>('sincronizaciones/preparacion.php', request);
    return parsearPreparacion(data);
  }
}
