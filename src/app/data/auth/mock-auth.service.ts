import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../core/http/api.service';
import { ApiLoginData } from '../../domain/auth/models/api-login-response.model';
import { LoginRequest } from '../../domain/auth/models/login-request.model';
import { LoginResponse } from '../../domain/auth/models/login-response.model';
<<<<<<< HEAD:src/app/data/auth/mock-auth.service.ts
import { AuthRepository } from '../../domain/auth/repositories/auth.repository';
import { cleanRut } from '../../domain/auth/utils/rut.utils';

@Injectable({ providedIn: 'root' })
export class MockAuthService implements AuthRepository {
  login(request: LoginRequest): Observable<LoginResponse> {
    const rut = cleanRut(request.rut);

    // Mock: siempre retorna éxito con datos de demo
    return of({
      success: true,
      token: `demo-token-${Date.now()}`,
=======
import { AuthApiRepository } from '../../domain/auth/repositories/auth-api.repository';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService implements AuthApiRepository {
  private api = inject(ApiService);

  async login(request: LoginRequest): Promise<LoginResponse> {
    const endpoint = environment.authEndpoint ?? 'auth/login.php';
    const data = await this.api.post<ApiLoginData>(endpoint, request);
    return {
>>>>>>> feat/modo-analista-maqueta:src/app/data/auth/auth.service.ts
      user: {
        rut: data.user.rut,
        rutNormalizado: data.user.rut_normalizado,
        correo: data.user.correo,
      },
    };
  }
}
