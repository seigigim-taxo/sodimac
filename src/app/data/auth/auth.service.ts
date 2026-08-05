import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../core/http/api.service';
import { ApiLoginData } from '../../domain/auth/models/api-login-response.model';
import { LoginRequest } from '../../domain/auth/models/login-request.model';
import { LoginResponse } from '../../domain/auth/models/login-response.model';
import { AuthApiRepository } from '../../domain/auth/repositories/auth-api.repository';

@Injectable({ providedIn: 'root' })
export class AuthService implements AuthApiRepository {
  private api = inject(ApiService);

  async login(request: LoginRequest): Promise<LoginResponse> {
    const data = await this.api.post<ApiLoginData>('auth/login.php', request);
    return {
      user: {
        rut: data.user.rut,
        rutNormalizado: data.user.rut_normalizado,
        correo: data.user.correo,
      },
    };
  }
}
