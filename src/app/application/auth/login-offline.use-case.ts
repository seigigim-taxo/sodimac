import { Injectable, inject } from '@angular/core';
import { OPERADOR_REPOSITORY_TOKEN } from '../../domain/auth/repositories/operador.repository';
import { LoginRequest } from '../../domain/auth/models/login-request.model';
import { Session } from '../../domain/auth/models/session.model';
import { getFirstSixDigits } from '../../domain/auth/utils/rut.utils';

export interface ResultadoLoginOffline {
  session: Session;
  fueOffline: true;
}

@Injectable({ providedIn: 'root' })
export class LoginOfflineUseCase {
  private operadorRepo = inject(OPERADOR_REPOSITORY_TOKEN);

  async execute(request: LoginRequest): Promise<ResultadoLoginOffline> {
    const rutNormalizado = request.rut;
    const rut   = parseInt(rutNormalizado.slice(0, -1), 10);
    const rutDv = rutNormalizado.slice(-1).toUpperCase();

    const cached = await this.operadorRepo.obtenerPorRut(rut, rutDv);
    if (!cached) {
      throw new Error('Sin conexión. Inicie sesión en línea al menos una vez.');
    }

    if (request.password !== getFirstSixDigits(request.rut)) {
      throw new Error('Contraseña incorrecta.');
    }

    return {
      fueOffline: true,
      session: {
        token:          'offline',
        operadorId:     cached.id,
        rutNormalizado,
        nombreCompleto: cached.nombres ?? '',
        cargo:          '',
        correo:         cached.correo,
      },
    };
  }
}
