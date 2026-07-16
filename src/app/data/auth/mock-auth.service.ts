import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { ApiService } from '../../core/http/api.service';
import { ApiLoginData } from '../../domain/auth/models/api-login-response.model';
import { LoginRequest } from '../../domain/auth/models/login-request.model';
import { LoginResponse } from '../../domain/auth/models/login-response.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);

  login(request: LoginRequest): Observable<LoginResponse> {
    return this.api.post<ApiLoginData>('auth/login.php', request).pipe(
      map((data) => ({
        success: true,
        token: data.token,
        user: {
          id: data.user.id,
          name: data.user.name,
          rut: data.user.rut,
        },
      })),
      catchError((error: Error) =>
        of({
          success: false,
          error: error.message || 'Error al iniciar sesión',
        })
      )
    );
  }
}
