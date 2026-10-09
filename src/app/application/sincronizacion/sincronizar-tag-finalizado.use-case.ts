import { Injectable, inject } from '@angular/core';
import { SINCRONIZACION_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { GuardarSyncTagInput } from '../../domain/sincronizacion/models/sincronizacion-sync.model';
import { TagFinalizadoResponse } from '../../domain/sincronizacion/models/tag-finalizado.model';
import { ApiService } from '../../core/http/api.service';
import { environment } from '../../../environments/environment';
import { IntentarEnvioUseCase, ResultadoIntento } from './intentar-envio.use-case';
import { MENSAJE_CONFLICTO, ResolverEnvioUseCase } from './resolver-envio.use-case';
import { mismoContenido } from './payload-envio';
import { EnvioEnCursoService } from './envio-en-curso.service';

export interface ResultadoSyncTag {
  ok: boolean;
  enviado: boolean;
  error?: string;
  /** No se pudo averiguar si el servidor lo recibió: pudo haberlo guardado. */
  enDuda?: boolean;
  /** El identificador pertenece a otro TAG. */
  conflicto?: boolean;
  /** El TAG cambió después de un envío que el servidor tiene o pudo haber recibido. */
  cambioTrasEnvio?: boolean;
  /** El servidor lo tiene, pero con otro contenido que la PDA. */
  conDiferencias?: boolean;
  /** No hizo falta enviar: el servidor ya lo tenía confirmado. */
  yaEstabaEnviado?: boolean;
  /** Otro envío del mismo TAG está en marcha: no se duplica, y no es un fallo. */
  yaSeEnvia?: boolean;
}

export const MENSAJE_CAMBIO_TRAS_ENVIO =
  'Este TAG cambió después de enviarse y no se puede volver a enviar. Contacta a soporte.';
export const MENSAJE_YA_SE_ENVIA = 'Este TAG ya se está enviando. Espera unos segundos.';
export const MENSAJE_SIN_CONFIRMAR = 'No se pudo confirmar si el servidor recibió este TAG.';

@Injectable({ providedIn: 'root' })
export class SincronizarTagFinalizadoUseCase {
  private sincronizacionRepo = inject(SINCRONIZACION_REPOSITORY_TOKEN);
  private api = inject(ApiService);
  private intentar = inject(IntentarEnvioUseCase);
  private resolver = inject(ResolverEnvioUseCase);
  private candado = inject(EnvioEnCursoService);

  /**
   * Guarda el payload en sod_sincronizacion como PENDIENTE, intenta enviarlo
   * al WS y deja anotado lo que se sabe del resultado.
   *
   * El analista no pasa por las reglas de abajo: su envío no es de un TAG del
   * operador y sigue exactamente como antes.
   */
  async execute(input: GuardarSyncTagInput): Promise<ResultadoSyncTag> {
    if (!this.esTagDeOperador(input)) return this.enviarSinReglasDeTag(input);

    /*
     * Un envío a la vez por TAG: si el reintento automático ya lo está mandando,
     * este intento no lo duplica. No es un fallo del TAG, solo hay que esperar.
     */
    if (!this.candado.tomar(input.cargaUid)) {
      return { ok: false, enviado: false, error: MENSAJE_YA_SE_ENVIA, yaSeEnvia: true };
    }

    try {
      const previo = await this.revisarEnvioPrevio(input);
      if (previo) return previo;

      await this.sincronizacionRepo.guardarSyncTag(input);

      const resultado = await this.intentar.execute({
        cargaUid: input.cargaUid,
        payload: input.payload,
        payloadJson: JSON.stringify(input.payload),
        previoEnDuda: false,
      });

      return this.aResultado(resultado);
    } finally {
      this.candado.soltar(input.cargaUid);
    }
  }

  private esTagDeOperador(input: GuardarSyncTagInput): boolean {
    return input.perfil === 'OPERADOR' && input.conteoId !== null && input.ubicacionId !== null;
  }

  /*
   * ¿Este TAG ya tuvo un envío? Si el servidor lo tiene, o pudo tenerlo, no se
   * manda otra vez: se averigua. Devuelve el resultado final cuando ya quedó
   * resuelto, o null si hay que enviarlo con normalidad.
   */
  private async revisarEnvioPrevio(input: GuardarSyncTagInput): Promise<ResultadoSyncTag | null> {
    const previo = await this.sincronizacionRepo.estadoEnvioTag(input.conteoId as number, input.ubicacionId as number);
    if (previo.estado !== 'ENVIADO' && previo.estado !== 'EN_DUDA') return null;

    const cargaUid = previo.cargaUid as string;
    const guardado = await this.sincronizacionRepo.obtenerEnvio(cargaUid);
    const payloadActual = JSON.stringify(input.payload);

    /*
     * RED DE SEGURIDAD. Si el TAG cambió después de un envío que el servidor
     * tiene o pudo haber recibido, lo nuevo no viajaría: darlo por enviado
     * dejaría datos solo en la PDA, sin avisar. No se hace nada y se avisa.
     * Si no se puede comparar (payload ausente o ilegible), no se bloquea.
     */
    if (mismoContenido(guardado?.payloadJson ?? null, payloadActual) === false) {
      return { ok: false, enviado: false, error: MENSAJE_CAMBIO_TRAS_ENVIO, cambioTrasEnvio: true };
    }

    // Ya confirmado: no hay nada que mandar. Quien llama solo marca el TAG.
    if (previo.estado === 'ENVIADO') return { ok: true, enviado: true, yaEstabaEnviado: true };

    // En duda: se le pregunta al servidor, con el payload que quedó guardado.
    const resolucion = await this.resolver.execute({
      cargaUid,
      payloadJson: guardado?.payloadJson ?? payloadActual,
    });

    if (resolucion.tipo === 'ENVIADO') {
      return { ok: true, enviado: true, conDiferencias: resolucion.conDiferencias };
    }
    if (resolucion.tipo === 'NO_RECIBIDO' && resolucion.conflicto) {
      return { ok: false, enviado: false, error: MENSAJE_CONFLICTO, conflicto: true };
    }
    if (resolucion.tipo === 'SIN_RESPUESTA') {
      return { ok: false, enviado: false, error: guardado?.error ?? MENSAJE_SIN_CONFIRMAR, enDuda: true };
    }

    // El servidor confirmó que NO lo tiene: ahora es un envío común.
    return null;
  }

  private aResultado(r: ResultadoIntento): ResultadoSyncTag {
    switch (r.tipo) {
      case 'ENVIADO':
        return { ok: true, enviado: true, conDiferencias: r.conDiferencias };
      case 'NO_RECIBIDO':
        return { ok: false, enviado: false, error: r.error, conflicto: r.conflicto };
      default:
        return { ok: false, enviado: false, error: r.error, enDuda: true };
    }
  }

  /* El camino de siempre, sin reglas de TAG. Lo usa el analista. */
  private async enviarSinReglasDeTag(input: GuardarSyncTagInput): Promise<ResultadoSyncTag> {
    await this.sincronizacionRepo.guardarSyncTag(input);

    try {
      const response = await this.api.post<TagFinalizadoResponse>(
        environment.tagFinalizadoEndpoint,
        input.payload,
      );
      await this.sincronizacionRepo.marcarEnviado(input.cargaUid, response.total_productos);
      return { ok: true, enviado: true };
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error al enviar conteo al servidor';
      await this.sincronizacionRepo.marcarError(input.cargaUid, mensaje);
      return { ok: false, enviado: false, error: mensaje };
    }
  }
}
