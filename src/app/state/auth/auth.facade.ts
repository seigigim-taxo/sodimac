import { Injectable, inject, signal, computed } from '@angular/core';
<<<<<<< HEAD
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
=======
import { LoginUseCase } from '../../application/auth/login.use-case';
import { LogoutUseCase } from '../../application/auth/logout.use-case';
import { LoadSessionUseCase } from '../../application/auth/load-session.use-case';
import { PersistSessionUseCase } from '../../application/auth/persist-session.use-case';
import { Session } from '../../domain/auth/models/session.model';
import { LoginRequest } from '../../domain/auth/models/login-request.model';
export type { Session, LoginRequest };

@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private loginUC = inject(LoginUseCase);
  private logoutUC = inject(LogoutUseCase);
  private loadSession = inject(LoadSessionUseCase);
  private persistSession = inject(PersistSessionUseCase);
>>>>>>> feat/modo-analista-maqueta

  private sessionSignal = signal<Session | null>(null);
  private loadingSignal = signal(false);
  private errorSignal = signal<string | null>(null);
  private offlineLoginSignal = signal(false);

  readonly session = this.sessionSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.sessionSignal() !== null);
  readonly wasOfflineLogin = this.offlineLoginSignal.asReadonly();
  readonly hasKnownProfile = computed(() => !!this.sessionSignal()?.tipoUsuario);
  readonly isAnalyst = computed(() => this.sessionSignal()?.tipoUsuario === 'ANALISTA_CLIENTE');
  readonly isOperator = computed(() => this.sessionSignal()?.tipoUsuario === 'OPERADOR');

  async init(): Promise<void> {
<<<<<<< HEAD
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
=======
    const session = await this.loadSession.execute();
    if (session) {
      this.sessionSignal.set(session);
>>>>>>> feat/modo-analista-maqueta
    }
  }

  async login(request: LoginRequest): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    this.offlineLoginSignal.set(false);
    try {
<<<<<<< HEAD
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
=======
      const { session, fueOffline } = await this.loginUC.execute(request);
      this.offlineLoginSignal.set(fueOffline);
      await this.saveSession(session);
    } catch (err: unknown) {
      this.errorSignal.set(extractMessage(err));
>>>>>>> feat/modo-analista-maqueta
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async actualizarPerfilSesion(perfil: { tipoUsuario: string; nombreCompleto: string }): Promise<void> {
    const current = this.sessionSignal();
    if (!current) return;
    await this.saveSession({
      ...current,
      tipoUsuario: perfil.tipoUsuario,
      nombreCompleto: perfil.nombreCompleto,
    });
  }

  private async saveSession(session: Session): Promise<void> {
    await this.persistSession.execute(session);
    this.sessionSignal.set(session);
  }

  async logout(): Promise<void> {
<<<<<<< HEAD
    await this.preferencesService.remove(SESSION_KEY);
=======
    await this.logoutUC.execute();
>>>>>>> feat/modo-analista-maqueta
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

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Error al iniciar sesión';
}
