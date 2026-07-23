import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../core/http/api.service';
import { ApiLoginData } from '../../domain/auth/models/api-login-response.model';
import { LoginRequest } from '../../domain/auth/models/login-request.model';
import { LoginResponse } from '../../domain/auth/models/login-response.model';
import { AuthApiRepository } from '../../domain/auth/repositories/auth-api.repository';

@Injectable({ providedIn: 'root' })
export class AuthService implements AuthApiRepository {
  private api = inject(ApiService);

  login(request: LoginRequest): Observable<LoginResponse> {
    return this.api.post<ApiLoginData>('auth/login.php', request).pipe(
      map((data) => {
        return {
          token: data.token,
          user: {
            nombreCompleto: data.user.nombre_completo,
            apellidoPaterno: data.user.apellido_paterno ?? '',
            apellidoMaterno: data.user.apellido_materno ?? '',
            rut: data.user.rut,
            rutNormalizado: data.user.rut_normalizado,
            cargo: data.user.rol,
            correo: data.user.correo,
          },
        };
      })
    );
  }
}
