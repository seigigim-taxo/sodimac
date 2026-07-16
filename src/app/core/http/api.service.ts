import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ApiResponse<T> {
  status: 'OK' | 'ERROR';
  msg: string;
  data?: T;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  get<T>(path: string, params?: Record<string, string | number | boolean>): Observable<T> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        httpParams = httpParams.set(key, String(value));
      });
    }

    return this.http
      .get<ApiResponse<T>>(`${this.baseUrl}/${path}`, { params: httpParams })
      .pipe(map((response) => this.unwrap(response)));
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http
      .post<ApiResponse<T>>(`${this.baseUrl}/${path}`, body)
      .pipe(map((response) => this.unwrap(response)));
  }

  private unwrap<T>(response: ApiResponse<T>): T {
    if (response.status === 'ERROR') {
      throw new Error(response.msg ?? 'Error en el servicio');
    }

    if (response.data === undefined || response.data === null) {
      throw new Error('Respuesta del servicio sin datos');
    }

    return response.data;
  }
}
