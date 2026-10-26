import { Injectable, inject } from '@angular/core';
import { AppInfoService } from '../../core/app-info.service';
import { IdentidadOperador } from '../../domain/zonificacion/models/operacion-zonificacion.model';
import { AuthFacade } from '../../state/auth/auth.facade';
import { PdaFacade } from '../../state/pda/pda.facade';

/*
 * Quién y desde dónde se zonifica: va en TODA petición al WS. El login es el
 * correo del operador (el mismo que identifica sus asignaciones en el SGO) y el
 * RUT va normalizado, tal como lo usa el reporte de versión.
 *
 * Sin sesión o sin PDA registrada no hay identidad: se devuelve null y quien
 * llama decide (lo normal es no ofrecer la función).
 */
@Injectable({ providedIn: 'root' })
export class IdentidadZonificacionService {
  private auth = inject(AuthFacade);
  private pdaFacade = inject(PdaFacade);
  private appInfo = inject(AppInfoService);

  async obtener(): Promise<IdentidadOperador | null> {
    const sesion = this.auth.session();
    const pda = this.pdaFacade.pda();
    if (!sesion || !pda) return null;

    const version = await this.appInfo.version();
    return {
      operadorLogin: sesion.correo,
      operadorRut: sesion.rutNormalizado,
      pdaCodigo: pda.codigo,
      versionApp: version.nombre,
    };
  }
}
