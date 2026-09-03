import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';
import { Evento } from '../../domain/evento/models/evento.model';

/*
 * Deshace el cierre de un evento: es el inverso exacto de FinalizarEventoUseCase,
 * no una reapertura genérica.
 *
 * PARA QUÉ EXISTE
 *
 * El operador puede tocar "Actualizar" en Home después de cerrar su conteo, y el
 * SGO todavía no le asignó nada distinto — le devuelve el mismo codigo_muestra
 * que el evento que él mismo acaba de cerrar. Ese cierre fue prematuro: no había
 * trabajo nuevo esperando, así que se deshace para que pueda seguir contando en
 * la MISMA ronda, sin perder nada de lo ya sincronizado.
 *
 * POR QUÉ NO ES UN RECONTEO
 *
 * AbrirSiguienteIteracionUseCase abre una iteración NUEVA (2, 3, ...) sobre una
 * muestra que el SGO analizó y mandó a recontar. Acá no hay análisis del SGO de
 * por medio —ni siquiera se enteró de que el evento se cerró—, así que no
 * corresponde sumar una iteración: se vuelve exactamente a como estaba.
 *
 * QUÉ NO TOCA
 *
 * Las líneas de sod_conteo_detalle no se mueven: los TAGs que ya se cerraron y
 * sincronizaron durante ese conteo siguen SINCRONIZADOS. Reabrir la ronda solo
 * habilita a abrir TAGs nuevos sobre ella, igual que si nunca se hubiera cerrado.
 */
@Injectable({ providedIn: 'root' })
export class ReabrirEventoUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);
  private eventoRepo = inject(EVENTO_REPOSITORY_TOKEN);

  async execute(eventoId: number): Promise<Evento> {
    const evento = await this.eventoRepo.getById(eventoId);
    if (!evento) {
      throw new Error(`No se encontró el evento ${eventoId}`);
    }
    if (evento.estado !== 'EN_ANALISIS') {
      throw new Error('Solo se puede reabrir un evento que esté en análisis.');
    }

    const ronda = await this.conteoRepo.getUltimaRonda(eventoId);
    if (!ronda || ronda.estado !== 'FINALIZADO') {
      throw new Error('El evento no tiene una ronda cerrada que reabrir.');
    }

    await this.conteoRepo.reabrirRonda(ronda.id);
    await this.eventoRepo.updateEstado(eventoId, 'ABIERTO');

    return { ...evento, estado: 'ABIERTO' };
  }
}
