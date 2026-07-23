import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { LoginRequest } from '../models/login-request.model';
import { LoginResponse } from '../models/login-response.model';

export interface AuthApiRepository {
  login(request: LoginRequest): Observable<LoginResponse>;
}

export const AUTH_API_REPOSITORY_TOKEN = new InjectionToken<AuthApiRepository>('AuthApiRepository');
