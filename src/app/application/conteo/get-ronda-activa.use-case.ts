import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { Conteo } from '../../domain/conteo/models/conteo.model';

@Injectable({ providedIn: 'root' })
export class GetRondaActivaUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  /*
   * Ronda abierta del evento. Reemplaza al viejo GetIteracionActivaUseCase, que
   * derivaba el número con MAX() sobre las líneas contadas y por eso no podía
   * ver una ronda recién abierta y todavía vacía.
   *
   * Devuelve null si el evento no tiene ninguna ronda abierta: eso es un estado
   * legítimo (evento en análisis, o recién creado) y quien llama decide qué hacer.
   */
  execute(eventoId: number): Promise<Conteo | null> {
    return this.conteoRepo.getRondaAbierta(eventoId);
  }
}
