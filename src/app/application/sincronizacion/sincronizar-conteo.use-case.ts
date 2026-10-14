import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
import { EnvioFallidoError } from '../../domain/shared/errors/envio-fallido.error';
import { SincronizarTagFinalizadoUseCase } from './sincronizar-tag-finalizado.use-case';

@Injectable({ providedIn: 'root' })
export class SincronizarConteoUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);
  private syncTag = inject(SincronizarTagFinalizadoUseCase);

  /*
   * Si el servidor no tiene el TAG confirmado, lanza un EnvioFallidoError que dice
   * por qué: "no se envió" y "no sabemos si se envió" no son lo mismo para el
   * operador, y la pantalla tiene que poder distinguirlos.
   *
   * Que el servidor ya lo tuviera (porque la respuesta de un envío anterior se
   * perdió) NO es un fallo: el TAG se marca como sincronizado igual.
   */
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
      throw new EnvioFallidoError(resultado.error ?? 'Error al sincronizar conteo', {
        enDuda: resultado.enDuda,
        conflicto: resultado.conflicto,
        cambioTrasEnvio: resultado.cambioTrasEnvio,
        yaSeEnvia: resultado.yaSeEnvia,
      });
    }

    await this.conteoRepo.marcarSincronizado(
      conteo.conteoId, conteo.ubicacionId, conteo.operadorId, conteo.pdaId,
    );
  }
}
