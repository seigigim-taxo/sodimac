import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { LoginOnlineUseCase } from '../../application/auth/login-online.use-case';
import { LoginOfflineUseCase } from '../../application/auth/login-offline.use-case';
import { LogoutUseCase } from '../../application/auth/logout.use-case';
import { LoadSessionUseCase } from '../../application/auth/load-session.use-case';
import { PersistSessionUseCase } from '../../application/auth/persist-session.use-case';
import { SeedDevDataUseCase } from '../../application/dev/seed-dev-data.use-case';
import { Session } from '../../domain/auth/models/session.model';
import { LoginRequest } from '../../domain/auth/models/login-request.model';
export type { Session, LoginRequest };

@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private loginOnline    = inject(LoginOnlineUseCase);
  private loginOffline   = inject(LoginOfflineUseCase);
  private logoutUC       = inject(LogoutUseCase);
  private loadSession    = inject(LoadSessionUseCase);
  private persistSession = inject(PersistSessionUseCase);
  private seedDevData    = inject(SeedDevDataUseCase);

  private sessionSignal      = signal<Session | null>(null);
  private loadingSignal      = signal(false);
  private errorSignal        = signal<string | null>(null);
  private offlineLoginSignal = signal(false);

  readonly session         = this.sessionSignal.asReadonly();
  readonly loading         = this.loadingSignal.asReadonly();
  readonly error           = this.errorSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.sessionSignal() !== null);
  readonly wasOfflineLogin = this.offlineLoginSignal.asReadonly();

  async init(): Promise<void> {
    const session = await this.loadSession.execute();
    if (session) {
      /*
       * La sesión sobrevive en Preferences aunque la DB se haya recreado
       * (bump de versión). Sin este seed, un usuario con sesión persistida
       * entra directo al flujo con las tablas vacías.
       */
      await this.seedDevData.execute(session.operadorId);
      this.sessionSignal.set(session);
    }
  }

  async login(request: LoginRequest): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    this.offlineLoginSignal.set(false);
    try {
      const session = await this.loginOnline.execute(request);
      await this.seedDevData.execute(session.operadorId);
      await this.saveSession(session);
    } catch (err: unknown) {
      if (esErrorDeRed(err)) {
        await this.handleOfflineLogin(request);
      } else {
        this.errorSignal.set(extractMessage(err));
      }
    } finally {
      this.loadingSignal.set(false);
    }
  }

  private async handleOfflineLogin(request: LoginRequest): Promise<void> {
    try {
      const result = await this.loginOffline.execute(request);
      this.offlineLoginSignal.set(result.fueOffline);
      await this.seedDevData.execute(result.session.operadorId);
      await this.saveSession(result.session);
    } catch (err: unknown) {
      this.errorSignal.set(extractMessage(err));
    }
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

function esErrorDeRed(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 0;
}

function extractMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as { msg?: unknown } | null;
    if (typeof body?.msg === 'string' && body.msg) return body.msg;
    return `Error del servidor (${err.status})`;
  }
  if (err instanceof Error) return err.message;
  return 'Error al iniciar sesión';
}
