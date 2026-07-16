import { Injectable, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthRepository } from '../../domain/auth/repositories/auth.repository';
import { Session } from '../../domain/auth/models/session.model';
import { LoginRequest } from '../../domain/auth/models/login-request.model';
import { validateCredentials } from '../../domain/auth/utils/auth-validation.utils';
import { PreferencesService } from '../../core/storage/preferences.service';

const SESSION_KEY = 'session';

@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private authRepository = inject(AuthRepository);
  private preferencesService = inject(PreferencesService);

  private sessionSignal = signal<Session | null>(null);
  private loadingSignal = signal(false);
  private errorSignal = signal<string | null>(null);

  readonly session = this.sessionSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.sessionSignal() !== null);

  async init(): Promise<void> {
    const stored = await this.preferencesService.get(SESSION_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (this.isValidSession(parsed)) {
          this.sessionSignal.set(parsed);
        } else {
          await this.preferencesService.remove(SESSION_KEY);
        }
      } catch {
        await this.preferencesService.remove(SESSION_KEY);
      }
    }
  }

  async login(request: LoginRequest): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      // Validación de credenciales (regla de negocio)
      const validation = validateCredentials(request.rut, request.password);
      if (!validation.valid) {
        this.errorSignal.set(validation.error ?? 'Error al iniciar sesión');
        return;
      }

      // Llamada al repositorio (acceso a datos)
      const response = await firstValueFrom(this.authRepository.login(request));

      if (!response.success || !response.token || !response.user) {
        this.errorSignal.set(response.error ?? 'Error al iniciar sesión');
        return;
      }

      const session: Session = {
        token: response.token,
        userId: response.user.id,
        name: response.user.name,
        rut: response.user.rut,
      };

      await this.preferencesService.set(SESSION_KEY, JSON.stringify(session));
      this.sessionSignal.set(session);
    } catch (err) {
      this.errorSignal.set('Error al iniciar sesión');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.preferencesService.remove(SESSION_KEY);
    this.sessionSignal.set(null);
  }

  private isValidSession(value: unknown): value is Session {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as Session).token === 'string' &&
      (value as Session).token.length > 0 &&
      typeof (value as Session).userId === 'number' &&
      typeof (value as Session).name === 'string' &&
      typeof (value as Session).rut === 'string'
    );
  }
}
