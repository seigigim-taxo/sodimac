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

    const rut   = parseInt(response.user.rut, 10);
    const rutDv = response.user.rutNormalizado.slice(-1).toUpperCase();

    const localId = await this.operadorRepo.guardar({
      id:              0,
      rolId:           1,
      rut,
      rutDv,
      nombres:         response.user.nombreCompleto,
      apellidoPaterno: response.user.apellidoPaterno || null,
      apellidoMaterno: response.user.apellidoMaterno || null,
      correo:          response.user.correo,
      fechaRegistro:   '',
    });

    return {
      token:          response.token,
      operadorId:     localId,
      rutNormalizado: response.user.rutNormalizado,
      nombreCompleto: response.user.nombreCompleto,
      cargo:          response.user.cargo,
      correo:         response.user.correo,
    };
  }
}
