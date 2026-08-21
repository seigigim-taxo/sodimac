import { Injectable, inject } from '@angular/core';
import { LoginOnlineUseCase } from './login-online.use-case';
import { OPERADOR_REPOSITORY_TOKEN } from '../../domain/auth/repositories/operador.repository';
import { LoginRequest } from '../../domain/auth/models/login-request.model';
import { Session } from '../../domain/auth/models/session.model';
import { NetworkError } from '../../domain/shared/errors/network.error';
import { partirRut, getFirstSixDigits } from '../../domain/auth/utils/rut.utils';

export interface ResultadoLogin {
  session: Session;
  fueOffline: boolean;
}

/*
 * Política de autenticación V4: CACHE-FIRST.
 *
 * 1. Validar password contra los primeros 6 dígitos del RUT.
 *    Si no coincide → lanzar error inmediato, no tocar WS.
 * 2. Si la password es correcta, buscar operador en sod_user.
 *    Si existe → entrar offline sin llamar al WS.
 * 3. Si no existe en cache → login online normal.
 * 4. Si online falla por red y no hay cache → error claro.
 */
@Injectable({ providedIn: 'root' })
export class LoginUseCase {
  private online     = inject(LoginOnlineUseCase);
  private operadorRepo = inject(OPERADOR_REPOSITORY_TOKEN);

  async execute(request: LoginRequest): Promise<ResultadoLogin> {
    // 1. Validar password localmente: primeros 6 dígitos del cuerpo del RUT
    const validPassword = getFirstSixDigits(request.rut);
    if (request.password !== validPassword) {
      throw new Error('Contraseña incorrecta.');
    }

    // 2. Buscar operador en cache SQLite
    const { rut, rutDv } = partirRut(request.rut);
    const cached = await this.operadorRepo.obtenerPorRut(rut, rutDv);

    if (cached) {
      return {
        session: {
          operadorId:     cached.id,
          rutNormalizado: request.rut,
          correo:         cached.correo,
          tipoUsuario:    cached.tipoUsuario ?? undefined,
          nombreCompleto: cached.nombreCompleto ?? undefined,
        },
        fueOffline: true,
      };
    }

    // 4. No existe en cache → login online normal
    try {
      const session = await this.online.execute(request);
      return { session, fueOffline: false };
    } catch (err: unknown) {
      if (err instanceof NetworkError) {
        throw new Error('Sin conexión. Inicie sesión en línea al menos una vez.');
      }
      throw err;
    }
  }
}
