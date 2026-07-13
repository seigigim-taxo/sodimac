import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { LoginRequest } from '../models/login-request.model';
import { LoginResponse } from '../models/login-response.model';
import { cleanRut, getFirstSixDigits, validateRut } from '../../../shared/utils/rut.utils';

@Injectable({ providedIn: 'root' })
export class AuthService {
  login(request: LoginRequest): Observable<LoginResponse> {
    const rut = cleanRut(request.rut);

    if (!validateRut(rut)) {
      return of({ success: false, error: 'RUT inválido' });
    }

    const expectedPassword = getFirstSixDigits(rut);

    if (request.password !== expectedPassword) {
      return of({ success: false, error: 'Contraseña incorrecta' });
    }

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
