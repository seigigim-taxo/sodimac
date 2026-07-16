import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { LoginRequest } from '../../domain/auth/models/login-request.model';
import { LoginResponse } from '../../domain/auth/models/login-response.model';
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
      user: {
        id: 1,
        name: 'Operador Demo',
        rut,
      },
    }).pipe(delay(300));
  }
}
