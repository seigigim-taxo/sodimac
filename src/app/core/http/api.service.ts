import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { NetworkError } from '../../domain/shared/errors/network.error';
import { AutoReportService } from '../error-report/auto-report.service';

export interface ApiResponse<T> {
  status: 'OK' | 'ERROR';
  msg: string;
  data?: T;
}

/*
 * fetch NO trae timeout propio: sin AbortSignal, una conexión que acepta el TCP
 * pero nunca responde —portal cautivo, WiFi de tienda a medio asociar— deja la
 * promesa colgada hasta que corte el sistema operativo, que en móvil son
 * minutos. Finalizar un TAG levanta un overlay que cubre la pantalla, así que
 * eso se veía como la app congelada.
 */
const TIMEOUT_MS = 30_000;

export interface ApiRequestOptions {
  timeoutMs?: number;
  /**
   * No generar reporte automático para esta llamada. Obligatorio en el propio
   * endpoint de reportes (bucle: reporte fallido → nuevo reporte) y en login
   * (credencial mala es error del usuario, no del sistema).
   */
  sinReporte?: boolean;
}

/*
 * Adivinar "¿esto se cortó?" solo por la forma del texto (¿arranca con '{'?)
 * falla en las dos direcciones: un JSON completo pero con un bug de sintaxis
 * propio del backend también arranca con '{' y no parsea (falso "truncado"),
 * y un corte tan temprano que no llegó ni un byte no arranca con nada (falso
 * "no truncado"). Content-Length contra los bytes recibidos es una señal
 * real, no una adivinanza — se usa cuando el servidor la manda.
 *
 * PERO no si la respuesta viene comprimida (Content-Encoding: gzip/br/
 * deflate): ahí Content-Length describe el tamaño EN EL WIRE (comprimido),
 * mientras que `texto` es el body ya descomprimido por fetch() — comparar
 * esas dos magnitudes no dice nada sobre si el body llegó completo. En ese
 * caso se cae a la forma del texto, igual que sin Content-Length (respuestas
 * chunked, el caso más común en este backend).
 *
 * LÍMITE CONOCIDO: esto es adivinar desde el cliente con las señales que
 * expone fetch(), no una certeza. Ya van 3 casos límite parchados (forma de
 * texto → Content-Length → exclusión por compresión) y es previsible que
 * aparezca un cuarto (ej. un proxy intermedio que despoja Content-Encoding
 * sin ajustar Content-Length). La solución de raíz —que sodimac-ws incluya
 * una señal de integridad explícita en el propio body (largo esperado,
 * checksum, marcador de fin)— no depende de headers HTTP que un
 * intermediario puede alterar, pero implica tocar el backend y queda fuera
 * de alcance acá.
 */
function esTruncado(response: Response, texto: string): boolean {
  const contentEncoding = response.headers.get('content-encoding');
  const vieneComprimido = contentEncoding !== null && contentEncoding.toLowerCase() !== 'identity';

  if (!vieneComprimido) {
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > 0) {
      const bytesRecibidos = new TextEncoder().encode(texto).length;
      return bytesRecibidos < contentLength;
    }
  }

  return /^[{[]/.test(texto.trim());
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly baseUrl = environment.apiUrl;
  private readonly autoReport = inject(AutoReportService);

  async get<T>(path: string, params?: Record<string, string | number | boolean>, options?: ApiRequestOptions): Promise<T> {
    const url = new URL(`${this.baseUrl}/${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
    }

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(options?.timeoutMs ?? TIMEOUT_MS),
      });
      return await this.procesarRespuesta<T>(response, `GET ${path}`, options);
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async post<T>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options?.timeoutMs ?? TIMEOUT_MS),
      });
      return await this.procesarRespuesta<T>(response, `POST ${path}`, options);
    } catch (err) {
      throw this.mapError(err);
    }
  }

  /*
   * NO se mira response.ok acá: errorResponse() del backend manda status HTTP
   * de negocio (401 "usuario no existe", 405, 500 con su propio mensaje...) y
   * el body sigue siendo JSON válido con {status:'ERROR', msg}. Cortar antes
   * de leerlo por el código HTTP le robaría a unwrap() el mensaje real y
   * específico que escribió el backend, y lo reemplazaría por uno genérico —
   * pasó de verdad: un login rechazado dejó de mostrar "Usuario no existe o
   * inactivo" y mostraba "el servidor respondió con un error" en su lugar.
   *
   * Lo único que sí hay que atrapar es un cuerpo que NO se pudo parsear como
   * JSON. response.json() tira un SyntaxError crudo ("Unexpected end of JSON
   * input" o similar) que mapError() no reconoce —no tiene "network" ni
   * "timeout" en el mensaje— y lo deja pasar tal cual a la pantalla del
   * operador. Eso se convierte acá en un NetworkError, sea cual sea el status
   * HTTP.
   *
   * El mensaje SÍ distingue la causa: un corte de conexión bajando el body
   * merece "revisa la conexión"; un JSON inválido por otra razón (bug del
   * backend, HTML de un proxy/WAF) merece avisar a soporte, no confundir al
   * operador con un problema de red que no es el suyo. Ver esTruncado().
   */
  private async leerCuerpo(response: Response): Promise<unknown> {
    const texto = await response.text();
    try {
      return JSON.parse(texto);
    } catch (err) {
      const truncado = esTruncado(response, texto);
      console.error(
        truncado
          ? '[api] respuesta no es JSON válido (conexión cortada a medio camino):'
          : '[api] respuesta no es JSON válido (no parece un corte de conexión):',
        err,
      );
      /*
       * esDeConectividad: false en el caso no-truncado — no es un problema de
       * red, es un cuerpo que llegó completo pero no es JSON válido (bug del
       * backend, HTML de un proxy/WAF). Ver el comentario de NetworkError.
       */
      throw new NetworkError(
        truncado
          ? 'La respuesta del servidor llegó incompleta. Revisa la conexión e intenta de nuevo.'
          : 'El servidor respondió con datos que la aplicación no reconoce. Avisa a soporte.',
        truncado
      );
    }
  }

  /*
   * Todo request HTTP pasa por acá, así que es el lugar único para detectar
   * respuestas que la app no esperaba: status ≠ 200, cuerpo que no es JSON,
   * envelope status ERROR y data vacía. Cada caso deja un reporte automático
   * (con dedupe) y sigue lanzando el mismo error que antes hacia el llamador —
   * la pantalla del operador no cambia.
   *
   * Los fallos de RED (NetworkError/timeout) NO reportan: sin conexión es
   * condición esperada en tienda y la app ya tiene login offline. La excepción
   * es la descarga inicial, que reporta desde sync-loading.
   */
  private async procesarRespuesta<T>(response: Response, contexto: string, options?: ApiRequestOptions): Promise<T> {
    let data: unknown;
    try {
      data = await this.leerCuerpo(response);
    } catch (err) {
      /*
       * leerCuerpo solo tira NetworkError: truncado (conexión cortada) o no
       * truncado (HTML de proxy, bug del backend). El mensaje específico que ya
       * preparó se conserva tal cual. El reporte depende del caso: un cuerpo
       * ilegible con status de error sí es contrato roto; con status 200, solo
       * se reporta si NO es un corte de conectividad —sin conexión es
       * condición esperada en tienda y no es falla del sistema.
       */
      if (!response.ok) {
        this.reportar(contexto, `HTTP ${response.status} sin cuerpo JSON`, options);
      } else if (err instanceof NetworkError && !err.esDeConectividad) {
        this.reportar(contexto, 'La respuesta no es JSON válido', options);
      }
      throw err;
    }

    if (!response.ok) {
      const msg = (data as ApiResponse<unknown> | null)?.msg;
      this.reportar(contexto, `HTTP ${response.status}${msg ? `: ${msg}` : ''}`, options);
      throw new Error(msg || `El servidor respondió con error (${response.status}). Intenta de nuevo.`);
    }

    /*
     * JSON válido pero no-objeto (null, un string): antes estallaba como
     * TypeError crudo ("Cannot read properties of null") en la pantalla del
     * operador. Se trata como respuesta inválida y queda reportado.
     */
    if (data === null || typeof data !== 'object') {
      const forma = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;
      this.reportar(contexto, `Respuesta con forma inesperada: ${forma}`, options);
      throw new Error('Respuesta inválida del servidor. Intenta de nuevo.');
    }

    return this.unwrap<T>(data as ApiResponse<T>, contexto, options);
  }

  private unwrap<T>(data: ApiResponse<T>, contexto: string, options?: ApiRequestOptions): T {
    if (data.status === 'ERROR') {
      this.reportar(contexto, data.msg || 'Error en el servicio', options);
      throw new Error(data.msg ?? 'Error en el servicio');
    }

    if (data.data === undefined || data.data === null) {
      this.reportar(contexto, 'Respuesta sin data', options);
      throw new Error('Respuesta del servicio sin datos');
    }

    return data.data;
  }

  /*
   * Fire-and-forget: el reporte se guarda en SQLite en segundo plano. Nunca se
   * await-eca desde acá — ni se retrasa la respuesta que el operador está
   * viendo ni un fallo del guardado puede enmascarar el error original.
   */
  private reportar(contexto: string, detalle: string, options?: ApiRequestOptions): void {
    if (options?.sinReporte) return;
    void this.autoReport.reportar(contexto, detalle).catch((e) => {
      console.error('[api] no se pudo guardar el reporte automático:', e);
    });
  }

  /*
   * Los fallos de fetch llegan como TypeError con mensajes como
   * "Failed to fetch", "NetworkError" o "Load failed". Los mapeo a NetworkError
   * para que AuthFacade pueda detectarlos y caer al login offline.
   */
  private mapError(err: unknown): Error {
    if (err instanceof NetworkError) return err;

    /*
     * AbortSignal.timeout aborta con un DOMException llamado TimeoutError y el
     * mensaje "signal timed out" — que no contiene la palabra "timeout", así
     * que las comparaciones por texto de abajo no lo atrapan. Se detecta por
     * nombre.
     *
     * Un POST cortado por timeout puede haber llegado igual al servidor. No es
     * un problema acá: el carga_uid se persiste antes de enviar y el reintento
     * manda el mismo, así que el SGO puede descartar el duplicado.
     */
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      return new NetworkError('El servidor no respondió a tiempo. Revisa la conexión e intenta de nuevo.');
    }

    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      if (
        msg.includes('network') ||
        msg.includes('timeout') ||
        msg.includes('failed to fetch') ||
        msg.includes('failed to connect') ||
        msg.includes('unable to resolve') ||
        msg.includes('socket') ||
        msg.includes('load failed')
      ) {
        /*
         * El mensaje se REEMPLAZA, no se reenvía. El original es el texto del
         * navegador —"Failed to fetch", "Load failed"— y llegaba entero a la
         * pantalla del operador, en inglés y sin decirle qué hacer.
         *
         * Tampoco le sirve a soporte: "Failed to fetch" es lo mismo que dice
         * fetch para una red caída, un 404, un CORS y un socket cortado. No
         * distingue ninguno.
         *
         * El texto original va a la consola con su tag, para que quede en el
         * logcat del equipo — que es donde sí se puede diagnosticar.
         */
        console.error('[api] fallo de red:', err.name, err.message);
        return new NetworkError('Sin conexión con el servidor. Revisa la red e intenta de nuevo.');
      }
      return err;
    }

    console.error('[api] error no reconocido:', err);
    return new NetworkError('No se pudo conectar con el servidor. Intenta de nuevo.');
  }
}
