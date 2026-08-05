import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { BusquedaSkuResultado } from '../../domain/conteo/models/busqueda-sku.model';

@Injectable({ providedIn: 'root' })
export class BuscarSkuUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  // Lectura pura — dónde (tag/zona) hay filas registradas para ese SKU en el evento.
  execute(eventoId: number, sku: string): Promise<BusquedaSkuResultado[]> {
    return this.conteoRepo.buscarPorSku(eventoId, sku.trim().toUpperCase());
  }
}
