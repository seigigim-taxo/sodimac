import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoItem } from '../../domain/conteo/models/conteo-item.model';
import { ConteoLecturaSesion } from '../../domain/conteo/models/conteo-lectura-sesion.model';

export interface ReferenciaSincronizada {
  /* Agregado por SKU (sod_conteo_detalle) — un TAG solo puede tener un total por producto. */
  items: ConteoItem[];
  /* Una fila por captura real (sod_conteo_lectura) — puede haber varias por el mismo SKU. */
  lecturas: ConteoLecturaSesion[];
}

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
 * Trae las dos vistas porque responden preguntas distintas: `items` es "¿cuánto
 * hay en total de este SKU?" (un escaneo del mismo SKU dos veces suma en un
 * único detalle), `lecturas` es "¿qué se escaneó, y cuándo?" (cada captura es
 * su propia fila, aunque compartan SKU). Mezclarlas fue justamente el bug que
 * esto corrige: la pantalla mostraba `items` bajo la etiqueta "por lectura", y
 * dos capturas del mismo SKU se veían como una sola.
 */
@Injectable({ providedIn: 'root' })
export class ObtenerReferenciaSincronizadaUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  async execute(
    conteoId: number, ubicacionSincronizadaId: number, operadorId: number, pdaId: number
  ): Promise<ReferenciaSincronizada> {
    const [items, lecturas] = await Promise.all([
      this.conteoRepo.getBySesion(conteoId, ubicacionSincronizadaId, operadorId, pdaId, 'SINCRONIZADO'),
      this.conteoRepo.getLecturasSesion(conteoId, ubicacionSincronizadaId, operadorId, pdaId, 'SINCRONIZADO'),
    ]);
    return { items, lecturas };
  }
}
