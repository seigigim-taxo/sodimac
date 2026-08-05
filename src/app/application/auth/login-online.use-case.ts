import { Injectable, inject } from '@angular/core';
import { AUTH_API_REPOSITORY_TOKEN } from '../../domain/auth/repositories/auth-api.repository';
import { OPERADOR_REPOSITORY_TOKEN } from '../../domain/auth/repositories/operador.repository';
import { LoginRequest } from '../../domain/auth/models/login-request.model';
import { Session } from '../../domain/auth/models/session.model';

@Injectable({ providedIn: 'root' })
export class LoginOnlineUseCase {
  private authApi      = inject(AUTH_API_REPOSITORY_TOKEN);
  private operadorRepo = inject(OPERADOR_REPOSITORY_TOKEN);

  async execute(request: LoginRequest): Promise<Session> {
    const response = await this.authApi.login(request);

    // rutNormalizado ya viene limpio ('99800120K'), sin puntos ni guión.
    const rut   = parseInt(response.user.rutNormalizado.slice(0, -1), 10);
    const rutDv = response.user.rutNormalizado.slice(-1).toUpperCase();

    /*
     * El login solo devuelve rut y correo: el nombre y el rol no viajan en la
     * respuesta, asi que las columnas quedan nulas hasta que otra sincronizacion
     * las complete.
     */
    const localId = await this.operadorRepo.asegurarOperador(rut, rutDv, response.user.correo);

    return {
      operadorId:     localId,
      rutNormalizado: response.user.rutNormalizado,
      correo:         response.user.correo,
    };
  }
}
