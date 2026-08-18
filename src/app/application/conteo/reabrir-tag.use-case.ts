import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';

/*
 * Vuelve a abrir un TAG ya finalizado para seguir contándolo.
 *
 * El caso real: el operador cierra el TAG y se da cuenta de que le faltó
 * escanear algo, o de que una cantidad quedó mal. Sin esto, la única salida era
 * eliminar el conteo completo y rehacerlo.
 *
 * Un TAG sincronizado no se reabre: ya viajó al servidor, y editarlo acá dejaría
 * la PDA diciendo una cosa y el SGO otra. Para corregir eso hace falta una
 * decisión de negocio que hoy no existe.
 */
@Injectable({ providedIn: 'root' })
export class ReabrirTagUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);

  async execute(conteo: ConteoResumen): Promise<void> {
    if (conteo.estado === 'SINCRONIZADO') {
      throw new Error('Este TAG ya se sincronizó y no se puede volver a abrir.');
    }
    if (conteo.estado !== 'FINALIZADO') {
      throw new Error('Solo un TAG finalizado se puede volver a abrir.');
    }

    await this.conteoRepo.reabrirTag(
      conteo.conteoId, conteo.ubicacionId, conteo.operadorId, conteo.pdaId,
    );
  }
}
