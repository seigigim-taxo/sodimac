import { Injectable, inject } from '@angular/core';
import { SINCRONIZACION_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { TagFinalizadoResponse } from '../../domain/sincronizacion/models/tag-finalizado.model';
import { ApiService } from '../../core/http/api.service';
import { environment } from '../../../environments/environment';
import { NetworkError } from '../../domain/shared/errors/network.error';
import { FalloEnvio, clasificarFalloEnvio } from './clasificar-fallo-envio';
import { MENSAJE_CONFLICTO, MENSAJE_NO_RECIBIDO, ResolverEnvioUseCase } from './resolver-envio.use-case';

export interface EnvioAIntentar {
  cargaUid: string;
  /** Lo que se manda. */
  payload: unknown;
  /** El mismo payload como texto, para poder verificar la identidad al resolver. */
  payloadJson: string | null;
  /**
   * El envío YA estaba en duda antes de este intento: un intento anterior salió y
   * no se supo qué pasó. Importa porque, entonces, un fallo de ESTE intento no
   * prueba nada sobre el anterior.
   */
  previoEnDuda: boolean;
}

/*
 * Cómo terminó un intento de envío.
 *
 *   ENVIADO      El servidor lo tiene (lo recibió ahora, o ya lo tenía).
 *   NO_RECIBIDO  El servidor NO lo tiene. El TAG vuelve a ser editable. `conflicto`
 *                indica que el identificador pertenece a otro TAG.
 *   EN_DUDA      No se pudo saber. El servidor pudo haberlo guardado.
 *
 * `porRed` (solo cuando es true) indica que el envío falló por conectividad —sin
 * red, timeout, corte—. Sirve para no seguir probando con los demás envíos en la
 * misma tanda: si la red no anda para uno, tampoco para el resto.
 */
export type ResultadoIntento =
  | { tipo: 'ENVIADO'; conDiferencias: boolean }
  | { tipo: 'NO_RECIBIDO'; conflicto: boolean; error: string; porRed?: true }
  | { tipo: 'EN_DUDA'; error: string; porRed?: true };

/* Lo último que falló al hablar con el servidor, para saber si fue por la red. */
interface Traza { ultimoError?: unknown }

/*
 * Manda un envío al servidor, clasifica lo que pasó, lo resuelve preguntando si
 * hace falta, y deja anotado el resultado en la cola.
 *
 * Es UNA pieza compartida a propósito: el envío al finalizar y "Enviar
 * pendientes" tienen que fallar y recuperarse exactamente igual. Con dos copias,
 * una terminaría anotando como "no recibido" lo que la otra anota "en duda", y
 * de esa diferencia depende si un TAG se puede editar.
 *
 * QUÉ HACE ANTE UN FALLO
 *   - Sin red, o el servidor lo rechazó:  no llegó, se anota como error.
 *   - Se cortó o no volvió respuesta:     en duda. Se le pregunta al servidor.
 *   - 409 (ya existe):                    se le pregunta o se usa lo que trae.
 *   Si el servidor confirma que NO lo tiene, la consulta respondió —hay conexión—,
 *   así que se reenvía UNA vez antes de rendirse.
 */
@Injectable({ providedIn: 'root' })
export class IntentarEnvioUseCase {
  private repo = inject(SINCRONIZACION_REPOSITORY_TOKEN);
  private api = inject(ApiService);
  private resolver = inject(ResolverEnvioUseCase);

  async execute(envio: EnvioAIntentar): Promise<ResultadoIntento> {
    const traza: Traza = {};
    const resultado = await this.intentar(envio, traza);

    /*
     * Un conflicto se supo porque el servidor RESPONDIÓ a la consulta: la red
     * anduvo, aunque el primer POST se haya cortado. No cuenta como fallo de red.
     */
    const respondio = resultado.tipo === 'NO_RECIBIDO' && resultado.conflicto;
    const fueLaRed = traza.ultimoError instanceof NetworkError && traza.ultimoError.esDeConectividad;
    return resultado.tipo !== 'ENVIADO' && fueLaRed && !respondio ? { ...resultado, porRed: true } : resultado;
  }

  private async intentar(envio: EnvioAIntentar, traza: Traza): Promise<ResultadoIntento> {
    const primero = await this.enviar(envio, traza);
    if (primero.ok) return { tipo: 'ENVIADO', conDiferencias: false };

    const clase = this.clasificar(primero.error, envio.previoEnDuda);
    const mensaje = this.mensaje(primero.error);

    if (clase === 'NO_LLEGO') {
      await this.repo.marcarError(envio.cargaUid, mensaje);
      return { tipo: 'NO_RECIBIDO', conflicto: false, error: mensaje };
    }

    if (clase === 'EN_DUDA') await this.repo.marcarSinRespuesta(envio.cargaUid, mensaje);

    const resolucion = await this.resolver.execute(
      { cargaUid: envio.cargaUid, payloadJson: envio.payloadJson },
      primero.error,
    );

    switch (resolucion.tipo) {
      case 'ENVIADO':
        return { tipo: 'ENVIADO', conDiferencias: resolucion.conDiferencias };

      case 'NO_RECIBIDO':
        if (resolucion.conflicto) return { tipo: 'NO_RECIBIDO', conflicto: true, error: MENSAJE_CONFLICTO };
        /*
         * El servidor confirmó que no lo tiene. Si el fallo fue una duda, esto
         * ahora es una certeza y la consulta respondió, o sea que hay conexión:
         * vale la pena un único reenvío en vez de dejarlo para después.
         */
        if (clase === 'EN_DUDA') return this.reenviarUnaVez(envio, traza);
        return { tipo: 'NO_RECIBIDO', conflicto: false, error: MENSAJE_NO_RECIBIDO };

      default:
        return { tipo: 'EN_DUDA', error: mensaje };
    }
  }

  private async reenviarUnaVez(envio: EnvioAIntentar, traza: Traza): Promise<ResultadoIntento> {
    const segundo = await this.enviar(envio, traza);
    if (segundo.ok) return { tipo: 'ENVIADO', conDiferencias: false };

    // Ya se sabe con certeza que el servidor no lo tenía: no hay duda previa.
    const clase = this.clasificar(segundo.error, false);
    const mensaje = this.mensaje(segundo.error);

    if (clase === 'NO_LLEGO') {
      await this.repo.marcarError(envio.cargaUid, mensaje);
      return { tipo: 'NO_RECIBIDO', conflicto: false, error: mensaje };
    }

    if (clase === 'EN_DUDA') {
      await this.repo.marcarSinRespuesta(envio.cargaUid, mensaje);
      return { tipo: 'EN_DUDA', error: mensaje };
    }

    // 409: apareció justo ahora. Se resuelve con lo que trae o preguntando.
    const resolucion = await this.resolver.execute(
      { cargaUid: envio.cargaUid, payloadJson: envio.payloadJson },
      segundo.error,
    );

    if (resolucion.tipo === 'ENVIADO') return { tipo: 'ENVIADO', conDiferencias: resolucion.conDiferencias };
    if (resolucion.tipo === 'NO_RECIBIDO') {
      return resolucion.conflicto
        ? { tipo: 'NO_RECIBIDO', conflicto: true, error: MENSAJE_CONFLICTO }
        : { tipo: 'NO_RECIBIDO', conflicto: false, error: MENSAJE_NO_RECIBIDO };
    }
    return { tipo: 'EN_DUDA', error: mensaje };
  }

  /*
   * El POST va aparte de la escritura local a propósito: un fallo al anotar en la
   * base no es un fallo del envío, y mezclarlos lo tomaría por "no se supo qué
   * pasó" cuando el servidor sí respondió.
   */
  private async enviar(envio: EnvioAIntentar, traza: Traza): Promise<{ ok: true } | { ok: false; error: unknown }> {
    let respuesta: TagFinalizadoResponse;
    try {
      respuesta = await this.api.post<TagFinalizadoResponse>(environment.tagFinalizadoEndpoint, envio.payload);
    } catch (error) {
      traza.ultimoError = error;
      return { ok: false, error };
    }

    await this.repo.marcarEnviado(envio.cargaUid, respuesta.total_productos ?? 0);
    return { ok: true };
  }

  /*
   * Un envío que ya estaba en duda NO baja a "no llegó" por un fallo de este
   * intento: que ahora no haya red, o que el servidor rechace ESTA solicitud, no
   * dice nada de lo que pasó con el intento anterior, que pudo haberse guardado.
   */
  private clasificar(error: unknown, previoEnDuda: boolean): FalloEnvio {
    const clase = clasificarFalloEnvio(error);
    return previoEnDuda && clase === 'NO_LLEGO' ? 'EN_DUDA' : clase;
  }

  private mensaje(error: unknown): string {
    return error instanceof Error ? error.message : 'Error al enviar conteo al servidor';
  }
}
