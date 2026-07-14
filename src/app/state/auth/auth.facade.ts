import { Injectable, inject, signal, computed } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../data/auth/auth.service';
import { Session } from '../../domain/auth/models/session.model';
import { LoginRequest } from '../../domain/auth/models/login-request.model';

const SESSION_KEY = 'session';

@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private authService = inject(AuthService);

  private sessionSignal = signal<Session | null>(null);
  private loadingSignal = signal(false);
  private errorSignal = signal<string | null>(null);

  readonly session = this.sessionSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.sessionSignal() !== null);

  async init(): Promise<void> {
    const stored = await Preferences.get({ key: SESSION_KEY });
    if (stored.value) {
      this.sessionSignal.set(JSON.parse(stored.value));
    }
  }

  async login(request: LoginRequest): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(this.authService.login(request));

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

      await Preferences.set({ key: SESSION_KEY, value: JSON.stringify(session) });
      this.sessionSignal.set(session);
    } catch (err) {
      this.errorSignal.set('Error al iniciar sesión');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async logout(): Promise<void> {
    await Preferences.remove({ key: SESSION_KEY });
    this.sessionSignal.set(null);
  }
}
