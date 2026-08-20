import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
import { SincronizarTagFinalizadoUseCase } from './sincronizar-tag-finalizado.use-case';

@Injectable({ providedIn: 'root' })
export class SincronizarConteoUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);
  private syncTag = inject(SincronizarTagFinalizadoUseCase);

  async execute(conteo: ConteoResumen): Promise<void> {
    if (conteo.estado !== 'FINALIZADO') {
      throw new Error('Solo un conteo finalizado se puede sincronizar');
    }

    const payload = await this.conteoRepo.getPayloadSincronizacion(conteo);

    const resultado = await this.syncTag.execute({
      eventoId:   conteo.eventoId,
      pdaId:      conteo.pdaId,
      iteracion:  conteo.iteracion,
      perfil:     'OPERADOR',
      conteoId:   conteo.conteoId,
      ubicacionId: conteo.ubicacionId,
      operadorId: conteo.operadorId,
      cargaUid:   payload.carga_uid,
      payload,
    });

    if (!resultado.ok) {
      throw new Error(resultado.error ?? 'Error al sincronizar conteo');
    }

    await this.conteoRepo.marcarSincronizado(
      conteo.conteoId, conteo.ubicacionId, conteo.operadorId, conteo.pdaId,
    );
  }
}
