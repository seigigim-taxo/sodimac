import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../core/http/api.service';
import { ApiLoginData } from '../../domain/auth/models/api-login-response.model';
import { LoginRequest } from '../../domain/auth/models/login-request.model';
import { LoginResponse } from '../../domain/auth/models/login-response.model';
import { AuthApiRepository } from '../../domain/auth/repositories/auth-api.repository';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService implements AuthApiRepository {
  private api = inject(ApiService);

  async login(request: LoginRequest): Promise<LoginResponse> {
    const endpoint = environment.authEndpoint ?? 'auth/login.php';
    // sinReporte: credencial inválida es error del usuario, no del sistema.
    const data = await this.api.post<ApiLoginData>(endpoint, request, { sinReporte: true });
    return {
      user: {
        rut: data.user.rut,
        rutNormalizado: data.user.rut_normalizado,
        correo: data.user.correo,
      },
    };
  }
}
