import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoTrazabilidadItem } from '../../domain/conteo/models/conteo-trazabilidad-item.model';

/*
 * Lectura pura del detalle línea a línea de todo lo contado en el evento,
 * separado por iteración. No modifica estados — solo sirve para historial /
 * trazabilidad en la pantalla de resumen.
 */
@Injectable({ providedIn: 'root' })
export class GetTrazabilidadEventoUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  async execute(
    eventoId: number, operadorId: number, pdaId: number
  ): Promise<ConteoTrazabilidadItem[]> {
    return this.conteoRepo.getTrazabilidadEvento(eventoId, operadorId, pdaId);
  }
}
