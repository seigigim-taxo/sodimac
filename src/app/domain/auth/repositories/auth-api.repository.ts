import { InjectionToken } from '@angular/core';
import { LoginRequest } from '../models/login-request.model';
import { LoginResponse } from '../models/login-response.model';

export interface AuthApiRepository {
  login(request: LoginRequest): Promise<LoginResponse>;
}

export const AUTH_API_REPOSITORY_TOKEN = new InjectionToken<AuthApiRepository>('AuthApiRepository');
