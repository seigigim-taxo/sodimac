import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiError } from '../../domain/shared/errors/api.error';
import { NetworkError } from '../../domain/shared/errors/network.error';
import { esCodigoErrorZonificacion, esErrorDefinitivo } from '../../domain/zonificacion/models/error-zonificacion.model';
import { OperacionEnCola, SolicitudOperacion } from '../../domain/zonificacion/models/operacion-zonificacion.model';
import { ZONIFICACION_API_REPOSITORY_TOKEN } from '../../domain/zonificacion/repositories/zonificacion-api.repository';
import { ZONIFICACION_LOCAL_REPOSITORY_TOKEN } from '../../domain/zonificacion/repositories/zonificacion-local.repository';
import { EnvioEnCursoService } from '../sincronizacion/envio-en-curso.service';
import { IdentidadZonificacionService } from './identidad-zonificacion.service';

export interface ResultadoEnvioZonificacion {
  /* Operaciones que el servidor aplicó (o ya había aplicado) y salieron de la cola. */
  enviadas: number;
  /* Operaciones que el servidor rechazó para siempre en esta tanda. */
  rechazadas: number;
  /* Operaciones que siguen esperando y vale la pena volver a intentar. */
  reintentables: number;
  /* La tanda se cortó porque falló la red: no se probó con el resto. */
  cortadoPorRed: boolean;
}

export interface OpcionesEnvioZonificacion {
  /* Solo la cola de esta agenda. Sin esto, la de todas. */
  idAgenda?: number;
  /* Parar al primer fallo de red (para los reintentos automáticos, que cuidan la batería). */
  cortarAlFalloDeRed?: boolean;
}

/*
 * El candado de una agenda: lo toman el envío y, por la misma razón, quien edita
 * o elimina una operación pendiente de esa agenda. Mientras uno lo tiene, el
 * otro espera: así un cambio del operador no se pierde en medio de un envío.
 */
export const claveCandado = (idAgenda: number): string => `zonificacion:${idAgenda}`;

const datosDe = (valor: unknown): Record<string, unknown> =>
  valor !== null && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};

/*
 * Saca la cola de zonificación hacia el servidor.
 *
 * REGLAS
 *  - Primero en entrar, primero en salir, POR AGENDA. Cada operación se manda
 *    sola y hasta que el servidor la aplica no sale la siguiente: así "confirmar"
 *    nunca sale antes de los rangos que lo preceden.
 *  - Aplicada o YA_APLICADA: la operación sale de la cola. Para la app son lo
 *    mismo; la segunda es un reintento tras perder la respuesta.
 *  - Rechazo definitivo (4xx con un código del contrato): queda RECHAZADA con su
 *    motivo, no se reintenta y la cola sigue con la que viene.
 *  - Todo lo demás es transitorio: sin respuesta, respuesta ilegible, 500/503,
 *    código desconocido. La operación sigue PENDIENTE con el mismo
 *    operacion_uid y la cola de esa agenda se detiene hasta el próximo intento.
 *    Ante la duda se reintenta: descartar algo que quizá sí se aplicó es peor
 *    que insistir, porque el servidor ya sabe contestar YA_APLICADA.
 *  - Una agenda se envía de a una vez (candado en memoria): el reintento
 *    automático y el envío del operador no se pisan.
 */
@Injectable({ providedIn: 'root' })
export class EnviarZonificacionUseCase {
  private api = inject(ZONIFICACION_API_REPOSITORY_TOKEN);
  private local = inject(ZONIFICACION_LOCAL_REPOSITORY_TOKEN);
  private identidadService = inject(IdentidadZonificacionService);
  private candado = inject(EnvioEnCursoService);

  /*
   * Sube cada vez que una operación sale de la cola (aplicada) o queda rechazada.
   * Las pantallas lo miran para volver a leer lo local: el envío corre en segundo
   * plano y, sin este aviso, lo que se ve quedaría con la marca "pendiente" hasta
   * volver a entrar.
   */
  private cambiosSignal = signal(0);
  readonly cambios = this.cambiosSignal.asReadonly();

  /*
   * true mientras una tanda está hablando con el servidor. Las pantallas lo usan para
   * decir "Enviando…" con un spinner en vez de un aviso de "sin enviar" que, estando con
   * señal, sería engañoso. Es un contador porque pueden solaparse dos tandas (una por
   * agenda); se apaga cuando termina la última.
   */
  private enviosEnCurso = signal(0);
  readonly enviando = computed(() => this.enviosEnCurso() > 0);

  async execute(opciones: OpcionesEnvioZonificacion = {}): Promise<ResultadoEnvioZonificacion> {
    const resultado: ResultadoEnvioZonificacion = { enviadas: 0, rechazadas: 0, reintentables: 0, cortadoPorRed: false };

    const pendientes = await this.local.listarPendientes(opciones.idAgenda);
    if (pendientes.length === 0) return resultado;

    // Sin sesión o sin PDA no se puede identificar quién envía: todo queda esperando.
    const actual = await this.identidadService.obtener();
    if (!actual) {
      resultado.reintentables = pendientes.length;
      return resultado;
    }

    const agendas = [...new Set(pendientes.map((o) => o.idAgenda))];
    this.enviosEnCurso.update((n) => n + 1);
    try {
      for (const idAgenda of agendas) {
        const clave = claveCandado(idAgenda);
        if (!this.candado.tomar(clave)) continue;
        try {
          const corto = await this.enviarAgenda(idAgenda, actual.pdaCodigo, actual.versionApp, resultado, opciones);
          if (corto) break;
        } finally {
          this.candado.soltar(clave);
        }
      }
    } finally {
      this.enviosEnCurso.update((n) => n - 1);
    }
    return resultado;
  }

  /*
   * Devuelve true si hay que cortar toda la tanda (falló la red y se pidió cortar).
   *
   * La cola se lee ACÁ, con el candado de la agenda ya tomado, y no antes: quien
   * edita o elimina una operación pendiente toma el mismo candado, así que lo
   * que se lee es lo definitivo y no se puede mandar un contenido viejo. Se
   * vuelve a leer al terminar cada pasada, para sacar también lo que el
   * operador haya hecho mientras tanto sin esperar al próximo disparador.
   */
  private async enviarAgenda(
    idAgenda: number,
    pdaCodigo: string,
    versionApp: string,
    resultado: ResultadoEnvioZonificacion,
    opciones: OpcionesEnvioZonificacion,
  ): Promise<boolean> {
    let huboRechazo = false;
    let referencia: OperacionEnCola | null = null;

    pasadas: for (;;) {
      const cola = await this.local.listarPendientes(idAgenda);
      if (cola.length === 0) break;
      referencia ??= cola[0];

      for (let i = 0; i < cola.length; i++) {
        const op = cola[i];
        try {
          const aplicada = await this.api.enviar(this.solicitud(op, pdaCodigo, versionApp));
          await this.local.guardarEstado(aplicada.estado);
          await this.local.eliminar(op.id);
          resultado.enviadas++;
          this.cambiosSignal.update((n) => n + 1);
        } catch (err) {
          if (err instanceof ApiError && esCodigoErrorZonificacion(err.codigo) && esErrorDefinitivo(err.codigo)) {
            await this.local.marcarRechazada(op.id, { codigo: err.codigo, data: datosDe(err.datos) }, err.message);
            resultado.rechazadas++;
            huboRechazo = true;
            this.cambiosSignal.update((n) => n + 1);
            continue;
          }

          // Transitorio: esta y las que siguen en la agenda esperan al próximo intento.
          await this.local.registrarIntentoFallido(op.id);
          resultado.reintentables += cola.length - i;
          if (opciones.cortarAlFalloDeRed && err instanceof NetworkError && err.esDeConectividad) {
            resultado.cortadoPorRed = true;
            return true;
          }
          break pasadas;
        }
      }
    }

    // Tras un rechazo el estado local pudo quedar viejo (otra PDA, el SGO): se vuelve a pedir.
    if (huboRechazo && referencia) {
      await this.refrescarEstado(referencia, pdaCodigo, versionApp);
      // Las pantallas se releyeron al rechazarse, antes de traer el estado nuevo: se avisa de nuevo
      // para que muestren también lo que cambió en el servidor (pasó en la PDA: el rango de otra PDA no se veía).
      this.cambiosSignal.update((n) => n + 1);
    }
    return false;
  }

  private async refrescarEstado(op: OperacionEnCola, pdaCodigo: string, versionApp: string): Promise<void> {
    try {
      const estado = await this.api.obtenerEstado(
        { operadorLogin: op.operadorLogin, operadorRut: op.operadorRut, pdaCodigo, versionApp },
        op.idAgenda,
        op.numeroAgenda,
      );
      await this.local.guardarEstado(estado);
    } catch (err) {
      console.error('[EnviarZonificacion] no se pudo refrescar el estado tras un rechazo:', err);
    }
  }

  private solicitud(op: OperacionEnCola, pdaCodigo: string, versionApp: string): SolicitudOperacion {
    return {
      operacionUid: op.operacionUid,
      tipo: op.tipo,
      idAgenda: op.idAgenda,
      numeroAgenda: op.numeroAgenda,
      datos: op.datos,
      fechaHoraLocal: op.fechaHoraLocal,
      // Quien hizo la acción es quien figura, aunque el envío salga después con otra sesión abierta.
      identidad: { operadorLogin: op.operadorLogin, operadorRut: op.operadorRut, pdaCodigo, versionApp },
    };
  }
}
