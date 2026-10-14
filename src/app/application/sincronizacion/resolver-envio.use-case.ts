import { Injectable, inject } from '@angular/core';
import { SINCRONIZACION_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { ESTADO_CARGAS_API_REPOSITORY_TOKEN, EstadoCargaServidor } from '../../domain/sincronizacion/repositories/estado-cargas-api.repository';
import { TagFinalizadoResponse } from '../../domain/sincronizacion/models/tag-finalizado.model';
import { ApiError } from '../../domain/shared/errors/api.error';
import { ApiService } from '../../core/http/api.service';
import { environment } from '../../../environments/environment';
import { CODIGO_CARGA_DISTINTA, clasificarFalloEnvio } from './clasificar-fallo-envio';
import { ResumenPayload, resumirPayload } from './payload-envio';

/* Lo mínimo de un envío de la cola que hace falta para resolverlo. */
export interface EnvioPorResolver {
  cargaUid: string;
  /** El payload tal como quedó guardado; null si no se conserva. */
  payloadJson: string | null;
}

/*
 * Cómo terminó de resolverse un envío.
 *
 *   ENVIADO      El servidor lo tiene. `conDiferencias` indica que su contenido no
 *                es idéntico al que tiene la PDA (cantidad de lecturas distinta).
 *   NO_RECIBIDO  El servidor NO lo tiene, o el identificador es de otro envío
 *                (`conflicto`). El TAG puede volver a ser editable.
 *   SIN_RESPUESTA No se pudo averiguar: no hubo respuesta. Sigue en duda.
 */
export type ResultadoResolucion =
  | { tipo: 'ENVIADO'; conDiferencias: boolean }
  | { tipo: 'NO_RECIBIDO'; conflicto: boolean }
  | { tipo: 'SIN_RESPUESTA' };

export const MENSAJE_NO_RECIBIDO = 'El servidor no recibió este envío.';
export const MENSAJE_CONFLICTO = 'El identificador de este envío pertenece a otro TAG. Contacta a soporte.';

/*
 * Averigua si el servidor tiene un envío, y deja anotado lo que se concluyó en la
 * cola de envíos (sod_sincronizacion).
 *
 * POR QUÉ EXISTE
 * El servidor puede guardar un TAG y la respuesta perderse. Desde la PDA eso es
 * indistinguible de que nunca llegó, así que el envío queda "en duda" y el TAG
 * no se puede tocar. Esto le pregunta al servidor y lo resuelve.
 *
 * LA REGLA QUE NO SE NEGOCIA
 * Un envío se da por recibido solo si el servidor lo afirma explícitamente y es
 * el MISMO envío (tienda, TAG, iteración y agenda). Que un uid "exista" no basta:
 * si pertenece a otro TAG, no prueba que el nuestro llegó.
 *
 * QUÉ NO HACE
 * No marca el TAG como SINCRONIZADO: eso toca otra tabla y lo hace quien llama,
 * que es quien tiene los identificadores del TAG.
 */
@Injectable({ providedIn: 'root' })
export class ResolverEnvioUseCase {
  private repo = inject(SINCRONIZACION_REPOSITORY_TOKEN);
  private estadoApi = inject(ESTADO_CARGAS_API_REPOSITORY_TOKEN);
  private api = inject(ApiService);

  /*
   * `errorDeEnvio` es el error del intento de envío que dejó la duda, si lo hay.
   * Un 409 ya trae casi todo lo que hace falta y evita consultar.
   */
  async execute(envio: EnvioPorResolver, errorDeEnvio?: unknown): Promise<ResultadoResolucion> {
    const resumen = resumirPayload(envio.payloadJson);

    if (errorDeEnvio instanceof ApiError && errorDeEnvio.status === 409) {
      const directo = await this.desdeConflicto(envio, resumen, errorDeEnvio);
      if (directo) return directo;
    }

    let estados: EstadoCargaServidor[];
    try {
      estados = await this.estadoApi.consultar([envio.cargaUid]);
    } catch (err) {
      // El servidor todavía no tiene la consulta: se cae al reenvío idéntico.
      if (this.consultaNoDisponible(err)) return this.reenviarIdentico(envio, resumen);
      return { tipo: 'SIN_RESPUESTA' };
    }

    const estado = estados.find((e) => e.cargaUid === envio.cargaUid);
    // Lo que el servidor no menciona NO es "no existe": es "no se pudo saber".
    if (!estado) return { tipo: 'SIN_RESPUESTA' };

    return this.resolverConEstado(envio, estado);
  }

  /*
   * Aplica lo que el servidor dijo de un envío. Público porque la reconciliación
   * en lote consulta una sola vez por todos y reutiliza esta misma regla.
   *
   * `yaEsError`: la fila ya está anotada como error. Un "no existe" no la vuelve a
   * escribir, para que consultar una y otra vez no infle el contador de intentos.
   */
  async resolverConEstado(
    envio: EnvioPorResolver,
    estado: EstadoCargaServidor,
    opciones: { yaEsError?: boolean } = {},
  ): Promise<ResultadoResolucion> {
    if (!estado.existe) {
      if (!opciones.yaEsError) await this.repo.marcarError(envio.cargaUid, MENSAJE_NO_RECIBIDO);
      return { tipo: 'NO_RECIBIDO', conflicto: false };
    }

    const resumen = resumirPayload(envio.payloadJson);

    if (!this.mismaIdentidad(resumen, estado)) {
      await this.repo.marcarError(envio.cargaUid, MENSAJE_CONFLICTO);
      return { tipo: 'NO_RECIBIDO', conflicto: true };
    }

    return this.darPorEnviado(envio, resumen, estado.totalLecturas);
  }

  /* Un 409 de tag-finalizado.php: el `codigo` dice si es el mismo envío o uno ajeno. */
  private async desdeConflicto(
    envio: EnvioPorResolver,
    resumen: ResumenPayload | null,
    err: ApiError,
  ): Promise<ResultadoResolucion | null> {
    if (clasificarFalloEnvio(err) === 'CONFLICTO') {
      await this.repo.marcarError(envio.cargaUid, MENSAJE_CONFLICTO);
      return { tipo: 'NO_RECIBIDO', conflicto: true };
    }

    // El servidor nuevo informa cuántas lecturas tiene: no hace falta consultar.
    if (err.codigo === CODIGO_CARGA_DISTINTA) {
      const lecturas = this.lecturasDelServidor(err.datos);
      if (lecturas !== null) return this.darPorEnviado(envio, resumen, lecturas);
    }

    return null;
  }

  private async darPorEnviado(
    envio: EnvioPorResolver,
    resumen: ResumenPayload | null,
    lecturasServidor: number | null,
  ): Promise<ResultadoResolucion> {
    const productos = resumen?.totalProductos ?? 0;
    const locales = resumen?.totalLecturas ?? 0;

    // Sin lecturas locales que contar (payload viejo o ilegible) no hay con qué comparar.
    if (lecturasServidor !== null && locales > 0 && lecturasServidor !== locales) {
      await this.repo.marcarEnviadoConDiferencias(
        envio.cargaUid,
        productos,
        `El servidor ya tenía este envío con ${lecturasServidor} lectura(s) y la PDA tiene ${locales}.`,
      );
      return { tipo: 'ENVIADO', conDiferencias: true };
    }

    await this.repo.marcarEnviado(envio.cargaUid, productos);
    return { tipo: 'ENVIADO', conDiferencias: false };
  }

  /*
   * Solo se rechaza una identidad cuando el servidor la informa Y difiere. Un dato
   * que el servidor no mandó no se puede comparar, y no cuenta como diferencia.
   */
  private mismaIdentidad(resumen: ResumenPayload | null, estado: EstadoCargaServidor): boolean {
    if (!resumen) return true;

    const pares: [unknown, unknown][] = [
      [resumen.codigoTienda, estado.codigoTienda],
      [resumen.tagCodigo, estado.tagCodigo],
      [resumen.iteracion, estado.iteracion],
      [resumen.numeroAgenda, estado.numeroAgenda],
    ];

    return pares.every(([propio, ajeno]) => propio === null || ajeno === null || propio === ajeno);
  }

  /* 404 o 405: el servidor no tiene el endpoint de consulta (todavía no se desplegó). */
  private consultaNoDisponible(err: unknown): boolean {
    return err instanceof ApiError && (err.status === 404 || err.status === 405);
  }

  /*
   * Sin la consulta, la única forma de saber es mandar el payload guardado tal
   * cual. Es seguro porque el TAG está bloqueado y no cambió: el servidor lo
   * reconoce por su uid y no duplica nada.
   */
  private async reenviarIdentico(envio: EnvioPorResolver, resumen: ResumenPayload | null): Promise<ResultadoResolucion> {
    if (!envio.payloadJson) return { tipo: 'SIN_RESPUESTA' };

    let payload: unknown;
    try {
      payload = JSON.parse(envio.payloadJson);
    } catch {
      return { tipo: 'SIN_RESPUESTA' };
    }

    try {
      const respuesta = await this.api.post<TagFinalizadoResponse>(environment.tagFinalizadoEndpoint, payload);
      await this.repo.marcarEnviado(envio.cargaUid, respuesta.total_productos ?? resumen?.totalProductos ?? 0);
      return { tipo: 'ENVIADO', conDiferencias: false };
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error al enviar';

      switch (clasificarFalloEnvio(err)) {
        case 'NO_LLEGO':
          await this.repo.marcarError(envio.cargaUid, mensaje);
          return { tipo: 'NO_RECIBIDO', conflicto: false };

        case 'CONFLICTO':
          await this.repo.marcarError(envio.cargaUid, MENSAJE_CONFLICTO);
          return { tipo: 'NO_RECIBIDO', conflicto: true };

        case 'YA_LO_TIENE': {
          const lecturas = err instanceof ApiError ? this.lecturasDelServidor(err.datos) : null;
          if (lecturas !== null) return this.darPorEnviado(envio, resumen, lecturas);

          // El servidor lo tiene pero no dijo cuántas lecturas: no se puede comparar.
          await this.repo.marcarEnviadoConDiferencias(
            envio.cargaUid,
            resumen?.totalProductos ?? 0,
            'El servidor ya tenía este envío; no se pudo comparar su contenido.',
          );
          return { tipo: 'ENVIADO', conDiferencias: true };
        }

        default:
          await this.repo.marcarSinRespuesta(envio.cargaUid, mensaje);
          return { tipo: 'SIN_RESPUESTA' };
      }
    }
  }

  private lecturasDelServidor(datos: unknown): number | null {
    if (datos === null || typeof datos !== 'object') return null;
    const n = (datos as Record<string, unknown>)['lecturas_servidor'];
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
  }
}
