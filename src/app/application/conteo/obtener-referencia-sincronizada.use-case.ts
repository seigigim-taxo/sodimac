import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoItem } from '../../domain/conteo/models/conteo-item.model';

/*
 * Lo que ya se contó en un TAG SINCRONIZADO que coincide con el que se acaba
 * de abrir de nuevo — de solo lectura.
 *
 * Existe porque un TAG SINCRONIZADO es inmutable: no se reabre, no se toca.
 * Cuando el operador vuelve a escanear ese número, se crea un TAG nuevo (ver
 * RegistrarUbicacionUseCase / UbicacionRepository.insert), pero perder de
 * vista lo que ya se había contado ahí lo deja sin poder comparar si algo
 * quedó mal, o si ya se contó ese SKU y no hace falta de nuevo.
 *
 * Es una simple relectura de getBySesion apuntando a la ubicación VIEJA en
 * vez de la nueva — mismo método que usa la recuperación de sesión normal,
 * solo que acá el resultado no se usa para seguir escribiendo.
 */
@Injectable({ providedIn: 'root' })
export class ObtenerReferenciaSincronizadaUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  async execute(
    conteoId: number, ubicacionSincronizadaId: number, operadorId: number, pdaId: number
  ): Promise<ConteoItem[]> {
    return this.conteoRepo.getBySesion(conteoId, ubicacionSincronizadaId, operadorId, pdaId, 'SINCRONIZADO');
  }
}
