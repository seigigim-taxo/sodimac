import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { BusquedaSkuResultado } from '../../domain/conteo/models/busqueda-sku.model';

@Injectable({ providedIn: 'root' })
export class BuscarSkuUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  /*
   * Lectura pura — dónde (tag/zona) hay filas registradas para ese SKU.
   *
   * Sin `eventoId` busca en todo lo contado en la PDA. Es el caso de quien ya
   * terminó su conteo y todavía no tomó el siguiente: la pregunta "¿dónde conté
   * esto?" no deja de tener respuesta porque no haya un evento en curso.
   */
  execute(sku: string, eventoId?: number): Promise<BusquedaSkuResultado[]> {
    return this.conteoRepo.buscarPorSku(sku.trim().toUpperCase(), eventoId);
  }
}
