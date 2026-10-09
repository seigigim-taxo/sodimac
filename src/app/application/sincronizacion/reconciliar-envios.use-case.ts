import { Injectable, inject } from '@angular/core';
import { SINCRONIZACION_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { ESTADO_CARGAS_API_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/estado-cargas-api.repository';
import { SincronizacionSync } from '../../domain/sincronizacion/models/sincronizacion-sync.model';
import { ApiError } from '../../domain/shared/errors/api.error';
import { ResolverEnvioUseCase } from './resolver-envio.use-case';

/*
 * Qué pasó con los envíos pendientes al preguntarle al servidor por ellos.
 *
 *   confirmados     El servidor ya los tenía: quedaron como enviados.
 *   conDiferencias  De los confirmados, los que tienen otro contenido que la PDA.
 *   noRecibidos     El servidor no los tiene: vuelven a ser editables y reenviables.
 *   conflictos      Su identificador pertenece a otro TAG: no se dieron por enviados.
 *   sinRespuesta    No se pudo averiguar: siguen en duda.
 *
 * `consultaNoDisponible`: el servidor no tiene la consulta (404 o 405). En ese
 * caso nada se resolvió, y quien envía pendientes los resuelve reenviando.
 */
export interface ResultadoReconciliacion {
  total: number;
  confirmados: number;
  conDiferencias: number;
  noRecibidos: number;
  conflictos: number;
  sinRespuesta: number;
  consultaNoDisponible: boolean;
}

/*
 * Averigua, en UNA sola consulta, si el servidor ya tiene los envíos de TAG que
 * la PDA todavía figura como pendientes, y los deja resueltos.
 *
 * Es lo que hace que la PDA "se entere" de un TAG que el servidor guardó cuando
 * la respuesta se perdió. Pregunta con identificadores y no subiendo los TAGs
 * enteros: con la conexión mala, que es cuando se pierden las respuestas, es lo
 * que tiene más chances de pasar.
 *
 * NO envía nada ni modifica ningún TAG que el servidor no tenga: lo que el
 * servidor no tiene se anota como no recibido y se deja a quien envía.
 */
@Injectable({ providedIn: 'root' })
export class ReconciliarEnviosUseCase {
  private repo = inject(SINCRONIZACION_REPOSITORY_TOKEN);
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);
  private estadoApi = inject(ESTADO_CARGAS_API_REPOSITORY_TOKEN);
  private resolver = inject(ResolverEnvioUseCase);

  async execute(): Promise<ResultadoReconciliacion> {
    const pendientes = (await this.repo.listarPendientes())
      .filter((p) => p.operacion === 'TAG_FINALIZADO' && !!p.cargaUid);

    const resultado: ResultadoReconciliacion = {
      total: pendientes.length, confirmados: 0, conDiferencias: 0,
      noRecibidos: 0, conflictos: 0, sinRespuesta: 0, consultaNoDisponible: false,
    };
    if (pendientes.length === 0) return resultado;

    let estados;
    try {
      estados = await this.estadoApi.consultar(pendientes.map((p) => p.cargaUid as string));
    } catch (err) {
      resultado.sinRespuesta = pendientes.length;
      resultado.consultaNoDisponible = err instanceof ApiError && (err.status === 404 || err.status === 405);
      return resultado;
    }

    for (const item of pendientes) {
      const uid = item.cargaUid as string;
      const estado = estados.find((e) => e.cargaUid === uid);

      // Lo que el servidor no menciona no es "no existe": es "no se pudo saber".
      if (!estado) {
        resultado.sinRespuesta++;
        continue;
      }

      const r = await this.resolver.resolverConEstado(
        { cargaUid: uid, payloadJson: item.payloadJson },
        estado,
        { yaEsError: item.estado === 'ERROR' },
      );

      switch (r.tipo) {
        case 'ENVIADO':
          resultado.confirmados++;
          if (r.conDiferencias) resultado.conDiferencias++;
          await this.marcarTag(item);
          break;
        case 'NO_RECIBIDO':
          if (r.conflicto) resultado.conflictos++;
          else resultado.noRecibidos++;
          break;
        default:
          resultado.sinRespuesta++;
      }
    }

    return resultado;
  }

  /*
   * El envío ya quedó anotado como recibido; falta reflejarlo en el TAG. Si esto
   * falla no se pierde nada: el envío figura ENVIADO, así que el TAG sigue
   * bloqueado, y se corrige solo en la próxima reconciliación.
   */
  private async marcarTag(item: SincronizacionSync): Promise<void> {
    if (item.perfil !== 'OPERADOR' || !item.conteoId || !item.ubicacionId || !item.operadorId || !item.pdaId) return;

    try {
      await this.conteoRepo.marcarSincronizado(item.conteoId, item.ubicacionId, item.operadorId, item.pdaId);
    } catch (err) {
      console.error('[Reconciliar] no se pudo marcar el TAG como sincronizado:', err);
    }
  }
}
