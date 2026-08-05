import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { NetworkError } from '../../domain/shared/errors/network.error';

export interface ApiResponse<T> {
  status: 'OK' | 'ERROR';
  msg: string;
  data?: T;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly baseUrl = environment.apiUrl;

  async get<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
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
      });
      const data = await response.json();
      return this.unwrap<T>(data);
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      return this.unwrap<T>(data);
    } catch (err) {
      throw this.mapError(err);
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
        return new NetworkError(err.message);
      }
      return err;
    }
    return new NetworkError('Error de red desconocido');
  }
}
