import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { NetworkError } from '../../domain/shared/errors/network.error';
import { ConnectionQualityService } from '../../shared/services/connection-quality.service';

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
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly baseUrl = environment.apiUrl;
  private readonly connectionQuality = inject(ConnectionQualityService);

  async get<T>(path: string, params?: Record<string, string | number | boolean>, options?: ApiRequestOptions): Promise<T> {
    const url = new URL(`${this.baseUrl}/${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
    }

    try {
      const response = await this.fetchConTiempo(url.toString(), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(options?.timeoutMs ?? TIMEOUT_MS),
      });
      const data = await this.leerCuerpo(response) as ApiResponse<T>;
      return this.unwrap<T>(data);
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async post<T>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
    try {
      const response = await this.fetchConTiempo(`${this.baseUrl}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options?.timeoutMs ?? TIMEOUT_MS),
      });
      const data = await this.leerCuerpo(response) as ApiResponse<T>;
      return this.unwrap<T>(data);
    } catch (err) {
      throw this.mapError(err);
    }
  }

  /*
   * Mide solo la ida y vuelta real con el servidor —ni el parseo del body ni
   * la validación de status entran en la medición—: si fetch() resuelve, hubo
   * conexión de verdad, sea cual sea el status HTTP o el contenido. Si tira
   * excepción (timeout o fallo de red), es la señal contraria.
   *
   * ConnectionQualityService usa esto para estimar la calidad de la red con
   * tráfico real de la app, en vez de depender de navigator.connection —poco
   * confiable en los WebView de las PDAs—.
   */
  private async fetchConTiempo(url: string, init: RequestInit): Promise<Response> {
    const inicio = performance.now();
    try {
      const response = await fetch(url, init);
      this.connectionQuality.registrarExito(performance.now() - inicio);
      return response;
    } catch (err) {
      this.connectionQuality.registrarFallo();
      throw err;
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
   * Lo único que sí hay que atrapar es un cuerpo que dice ser JSON pero llegó
   * truncado: la conexión se cortó mientras bajaba el body. response.json()
   * tira un SyntaxError crudo ("Unexpected end of JSON input" o similar) que
   * mapError() no reconoce —no tiene "network" ni "timeout" en el mensaje— y
   * lo deja pasar tal cual a la pantalla del operador. Eso se convierte acá en
   * un NetworkError con mensaje propio, sea cual sea el status HTTP.
   */
  private async leerCuerpo(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (err) {
      console.error('[api] respuesta no es JSON válido (conexión cortada a medio camino):', err);
      throw new NetworkError('La respuesta del servidor llegó incompleta. Revisa la conexión e intenta de nuevo.');
    }
  }

  private unwrap<T>(data: ApiResponse<T>): T {
    if (data.status === 'ERROR') {
      throw new Error(data.msg ?? 'Error en el servicio');
    }

    if (data.data === undefined || data.data === null) {
      throw new Error('Respuesta del servicio sin datos');
    }

    return data.data;
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
