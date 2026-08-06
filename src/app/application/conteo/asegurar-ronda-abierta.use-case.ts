import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { Conteo } from '../../domain/conteo/models/conteo.model';

@Injectable({ providedIn: 'root' })
export class AsegurarRondaAbiertaUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  /*
   * Devuelve la ronda en la que se va a contar, abriendo la primera si el evento
   * todavía no tiene ninguna.
   *
   * Las rondas siguientes las abre AbrirSiguienteIteracionUseCase, tras el
   * análisis del SGO. La primera no tiene ese disparador: nace cuando el
   * operador empieza a contar. Sigue cumpliéndose lo importante — la ronda
   * existe antes de que se escriba una sola línea.
   *
   * Si hay rondas pero ninguna abierta, NO se abre una nueva: eso significa que
   * el evento está en análisis o cerrado, y abrir una ronda ahí saltearía el
   * flujo de reconteo.
   */
  async execute(eventoId: number): Promise<Conteo> {
    const abierta = await this.conteoRepo.getRondaAbierta(eventoId);
    if (abierta) return abierta;

    const ultima = await this.conteoRepo.getUltimaRonda(eventoId);
    if (ultima) {
      throw new Error(
        `La ronda ${ultima.iteracion} está cerrada y no hay ninguna abierta. ` +
        'El evento debe pasar por el análisis para habilitar una nueva.'
      );
    }

    return this.conteoRepo.abrirRonda(eventoId, 1);
  }
}
