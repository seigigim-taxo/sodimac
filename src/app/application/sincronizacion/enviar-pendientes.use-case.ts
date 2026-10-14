import { Injectable, inject } from '@angular/core';
import { SINCRONIZACION_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { SincronizacionSync } from '../../domain/sincronizacion/models/sincronizacion-sync.model';
import { ValidacionAnalistaPayloadAlmacenado, ValidacionAnalistaResponse } from '../../domain/sincronizacion/models/validacion-analista.model';
import { VersionReportPayload, VersionReportResponse } from '../../domain/sincronizacion/models/version-reporte.model';
import { ApiService } from '../../core/http/api.service';
import { IntentarEnvioUseCase } from './intentar-envio.use-case';
import { MENSAJE_CONFLICTO } from './resolver-envio.use-case';
import { ReconciliarEnviosUseCase } from './reconciliar-envios.use-case';
import { EnvioEnCursoService } from './envio-en-curso.service';
import { SanarTagsEnviadosUseCase } from './sanar-tags-enviados.use-case';
import { NetworkError } from '../../domain/shared/errors/network.error';

export interface ResultadoEnviarPendientes {
  enviados: number;
  conError: number;
  total: number;
  /** Número de los TAGs que dejaron de estar pendientes en esta tanda (el servidor ya los tiene). */
  confirmadosTags: string[];
  /** Cuántos siguen pendientes y vale la pena volver a intentar (no cuenta los que nunca saldrán). */
  reintentables: number;
  /** La tanda se cortó porque falló la red: no se probó con el resto. */
  cortadoPorRed: boolean;
}

/*
 * ¿Esta tanda cambió algo que las pantallas pueden estar mostrando? Un TAG que
 * dejó de estar pendiente (se confirmó o se envió) cambia su etiqueta y sus
 * botones; si solo falló, no cambió nada.
 *
 * Hallazgo de la prueba en la PDA: tras un envío automático, la pantalla de
 * resumen seguía diciendo "Pendiente de sincronizar" con Editar y Eliminar.
 */
export function cambioLoMostrado(r: ResultadoEnviarPendientes): boolean {
  return r.confirmadosTags.length > 0 || r.enviados > 0;
}

export interface OpcionesEnviarPendientes {
  /*
   * Parar la tanda al primer fallo de red, sin probar con los demás. Es para los
   * reintentos automáticos: cada envío puede tardar hasta 30 s en fallar, y con
   * mala señal insistir con todos solo mantiene la radio encendida.
   */
  cortarAlFalloDeRed?: boolean;
}

/* Cómo terminó el envío de una fila de la cola. */
interface Salida { salio: boolean; conflicto: boolean; porRed: boolean }

@Injectable({ providedIn: 'root' })
export class EnviarPendientesUseCase {
  private sincronizacionRepo = inject(SINCRONIZACION_REPOSITORY_TOKEN);
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);
  private api = inject(ApiService);
  private reconciliar = inject(ReconciliarEnviosUseCase);
  private intentar = inject(IntentarEnvioUseCase);
  private candado = inject(EnvioEnCursoService);
  private sanar = inject(SanarTagsEnviadosUseCase);

  /*
   * Primero se le pregunta al servidor, en una sola consulta, cuáles de los
   * pendientes ya tiene: un TAG cuya respuesta se perdió se confirma sin volver a
   * subirlo entero. Recién después se envía lo que de verdad falta.
   *
   * Si la consulta falla (sin red, o el servidor todavía no la tiene), no frena
   * nada: lo pendiente se envía igual, que es como funcionaba antes.
   */
  async execute(opciones: OpcionesEnviarPendientes = {}): Promise<ResultadoEnviarPendientes> {
    await this.mantenimientoLocal();

    const antes = await this.sincronizacionRepo.listarPendientes();
    const total = antes.length;
    let enviados = 0;
    let conError = 0;
    let reintentables = 0;
    let cortadoPorRed = false;

    /*
     * Si todo lo pendiente ya se sabe que no va a salir (un identificador ajeno, un
     * envío dañado), no se gasta ni una consulta. Con la cola vacía es lo mismo.
     */
    if (antes.every((item) => this.esDefinitivo(item))) {
      return { enviados, conError: total, total, confirmadosTags: [], reintentables, cortadoPorRed };
    }

    try {
      enviados += (await this.reconciliar.execute()).confirmados;
    } catch (err) {
      console.error('[EnviarPendientes] no se pudo reconciliar con el servidor:', err);
    }

    const pendientes = await this.sincronizacionRepo.listarPendientes();

    for (let i = 0; i < pendientes.length; i++) {
      const item = pendientes[i];

      if (this.esDefinitivo(item)) {
        conError++;
        continue;
      }
      const cargaUid = item.cargaUid as string;

      // Otro envío (el del operador, o una tanda anterior) ya lo está mandando.
      if (!this.candado.tomar(cargaUid)) continue;

      let salida: Salida;
      try {
        salida = item.operacion === 'VALIDACION_OPERACIONAL' ? await this.enviarValidacion(item)
          : item.operacion === 'VERSION_REPORTE' ? await this.enviarVersion(item)
          : await this.enviarTag(item);
      } catch (err) {
        console.error('[EnviarPendientes] fallo inesperado con', item.cargaUid, err);
        salida = { salio: false, conflicto: false, porRed: false };
      } finally {
        this.candado.soltar(cargaUid);
      }

      if (salida.salio) {
        enviados++;
        continue;
      }

      conError++;
      if (!salida.conflicto) reintentables++;

      if (opciones.cortarAlFalloDeRed && salida.porRed) {
        // Lo que falta sigue pendiente: se cuenta, pero no se prueba ahora.
        const resto = pendientes.slice(i + 1);
        conError += resto.length;
        reintentables += resto.filter((otro) => !this.esDefinitivo(otro)).length;
        cortadoPorRed = true;
        break;
      }
    }

    const confirmadosTags = await this.tagsConfirmados(antes);
    return { enviados, conError, total, confirmadosTags, reintentables, cortadoPorRed };
  }

  /*
   * Orden de la cola antes de mirarla, sin red y sin costo:
   *  - se borran los envíos fallidos de TAGs que el operador ya descartó, para que
   *    no se manden;
   *  - se marcan los TAGs que el servidor ya tiene pero que la PDA seguía
   *    mostrando como finalizados.
   * Si algo falla se sigue igual: es mantenimiento, no puede frenar los envíos.
   */
  private async mantenimientoLocal(): Promise<void> {
    try {
      await this.sincronizacionRepo.limpiarEnviosHuerfanos();
    } catch (err) {
      console.error('[EnviarPendientes] no se pudo limpiar la cola:', err);
    }

    try {
      await this.sanar.execute();
    } catch (err) {
      console.error('[EnviarPendientes] no se pudieron marcar los TAGs ya enviados:', err);
    }
  }

  /* Lo que ya se sabe que no va a salir por más que se insista. */
  private esDefinitivo(item: SincronizacionSync): boolean {
    if (!item.payloadJson || !item.cargaUid) return true;
    // Un identificador ajeno ya se sabe que no se puede enviar: no se insiste.
    return item.estado === 'ERROR' && item.error === MENSAJE_CONFLICTO;
  }

  /*
   * Los TAGs que estaban pendientes y ya no lo están: el servidor los tiene. Se
   * deduce comparando la cola antes y después, así cubre tanto los que se
   * enviaron como los que solo se confirmaron preguntando.
   */
  private async tagsConfirmados(antes: SincronizacionSync[]): Promise<string[]> {
    const despues = await this.sincronizacionRepo.listarPendientes();
    const siguenPendientes = new Set(despues.map((d) => d.cargaUid));
    const tags = new Set<string>();

    for (const item of antes) {
      if (item.operacion !== 'TAG_FINALIZADO' || !item.cargaUid || siguenPendientes.has(item.cargaUid)) continue;
      const tag = this.tagDe(item.payloadJson);
      if (tag) tags.add(tag);
    }
    return [...tags];
  }

  private tagDe(payloadJson: string | null): string | null {
    if (!payloadJson) return null;
    try {
      const tag = (JSON.parse(payloadJson) as { tag_codigo?: unknown }).tag_codigo;
      return typeof tag === 'string' || typeof tag === 'number' ? String(tag) : null;
    } catch {
      return null;
    }
  }

  /* Un TAG: mismas reglas que al finalizar. `salio` es true si el servidor lo tiene. */
  private async enviarTag(item: SincronizacionSync): Promise<Salida> {
    const cargaUid = item.cargaUid as string;
    const payloadJson = item.payloadJson as string;

    let payload: unknown;
    try {
      payload = JSON.parse(payloadJson);
    } catch {
      await this.sincronizacionRepo.marcarError(cargaUid, 'El envío guardado está dañado.');
      return { salio: false, conflicto: false, porRed: false };
    }

    const resultado = await this.intentar.execute({
      cargaUid,
      payload,
      payloadJson,
      // PENDIENTE = resultado sin resolver: un intento anterior pudo haber llegado.
      previoEnDuda: item.estado === 'PENDIENTE',
    });

    if (resultado.tipo !== 'ENVIADO') {
      return {
        salio: false,
        conflicto: resultado.tipo === 'NO_RECIBIDO' && resultado.conflicto,
        porRed: resultado.porRed === true,
      };
    }

    if (item.perfil === 'OPERADOR' && item.conteoId && item.ubicacionId && item.operadorId && item.pdaId) {
      await this.conteoRepo.marcarSincronizado(item.conteoId, item.ubicacionId, item.operadorId, item.pdaId);
    }
    return { salio: true, conflicto: false, porRed: false };
  }

  /* El reporte de versión sigue como antes: se reintenta tal cual, sin reglas de TAG. */
  private async enviarVersion(item: SincronizacionSync): Promise<Salida> {
    const cargaUid = item.cargaUid as string;

    try {
      const payload: VersionReportPayload = JSON.parse(item.payloadJson as string);
      /*
       * api.post<T> ya devuelve el contenido de `data`, no el envoltorio
       * {status,msg,data}. Tipar con VersionReportResponse (el envoltorio)
       * hacía que response.data fuera undefined y marcarEnviado tirara
       * "Cannot read properties of undefined (reading 'id')" — el server
       * respondía 200 y la app lo contaba igual como error.
       */
      const response = await this.api.post<VersionReportResponse['data']>('sincronizaciones/reporte-version.php', payload);
      await this.sincronizacionRepo.marcarEnviado(cargaUid, response.id);
      return { salio: true, conflicto: false, porRed: false };
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error al enviar';
      await this.sincronizacionRepo.marcarError(cargaUid, mensaje);
      return { salio: false, conflicto: false, porRed: err instanceof NetworkError && err.esDeConectividad };
    }
  }

  /* La validación del analista sigue como antes. */
  private async enviarValidacion(item: SincronizacionSync): Promise<Salida> {
    const cargaUid = item.cargaUid as string;

    try {
      const payload: ValidacionAnalistaPayloadAlmacenado = JSON.parse(item.payloadJson as string);
      const response = await this.api.post<ValidacionAnalistaResponse>(
        'sincronizaciones/validacion-analista.php',
        payload,
      );
      await this.sincronizacionRepo.marcarEnviado(cargaUid, response.total_productos);
      return { salio: true, conflicto: false, porRed: false };
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error al enviar';
      await this.sincronizacionRepo.marcarError(cargaUid, mensaje);
      return { salio: false, conflicto: false, porRed: err instanceof NetworkError && err.esDeConectividad };
    }
  }
}
