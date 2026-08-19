import { Injectable, inject, signal, computed } from '@angular/core';
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
    const session = await this.loadSession.execute();
    if (session) {
      this.sessionSignal.set(session);
    }
  }

  async login(request: LoginRequest): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    this.offlineLoginSignal.set(false);
    try {
      const { session, fueOffline } = await this.loginUC.execute(request);
      this.offlineLoginSignal.set(fueOffline);
      await this.saveSession(session);
    } catch (err: unknown) {
      this.errorSignal.set(extractMessage(err));
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
    await this.logoutUC.execute();
    this.sessionSignal.set(null);
  }
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Error al iniciar sesión';
}
