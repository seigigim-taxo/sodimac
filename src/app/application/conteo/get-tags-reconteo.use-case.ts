import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';

@Injectable({ providedIn: 'root' })
export class GetTagsReconteoUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  /*
   * Devuelve los TAGs que ya se contaron en iteraciones anteriores al reconteo
   * actual. La lista se usa como sugerencia en la pantalla de ingreso de TAG:
   * el operador puede tocar un chip para autocompletar o ingresar uno nuevo —
   * en ese caso se le pide confirmación (el TAG puede ser uno nuevo que no
   * existía antes, o uno que se le pasó en la iteración anterior).
   */
  execute(eventoId: number, iteracionActual: number): Promise<string[]> {
    if (iteracionActual <= 1) return Promise.resolve([]);
    return this.conteoRepo.getTagsContadosEnIteracionesAnteriores(eventoId, iteracionActual);
  }
}
