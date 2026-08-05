import { Injectable, inject } from '@angular/core';
import { LoginOnlineUseCase } from './login-online.use-case';
import { LoginRequest } from '../../domain/auth/models/login-request.model';
import { Session } from '../../domain/auth/models/session.model';

export interface ResultadoLogin {
  session: Session;
  fueOffline: boolean;
}

/*
 * Política de autenticación. Hoy: SOLO ONLINE.
 *
 * El login offline está desactivado temporalmente, no eliminado:
 * LoginOfflineUseCase sigue en application/auth/ sin usarse. Para reactivarlo
 * hay que volver a poner acá las dos ramas que lo llamaban:
 *   1. Operador ya cacheado en SQLite → entrar sin tocar la red.
 *   2. La request falla con NetworkError → caer al caché.
 * Cualquier otro error (credenciales, contrato roto) se propaga tal cual.
 *
 * Mientras esté así, un operador sin conexión no puede entrar, y cada login
 * pasa por la sincronización — que es lo que mantiene el perfil al día.
 */
@Injectable({ providedIn: 'root' })
export class LoginUseCase {
  private online = inject(LoginOnlineUseCase);

  async execute(request: LoginRequest): Promise<ResultadoLogin> {
    const session = await this.online.execute(request);
    return { session, fueOffline: false };
  }
}
