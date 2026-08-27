import { Injectable, inject } from '@angular/core';
import {
  ACTUALIZACION_API_REPOSITORY_TOKEN,
  INSTALADOR_REPOSITORY_TOKEN,
} from '../../domain/actualizacion/repositories/actualizacion.repository';
import { EstadoActualizacion } from '../../domain/actualizacion/models/version-disponible.model';

/*
 * ¿Hay una versión más nueva que la instalada?
 *
 * Toda la decisión está acá y no en la pantalla, porque es la única parte de la
 * autoactualización que se puede probar sin un equipo Android de por medio.
 */
@Injectable({ providedIn: 'root' })
export class BuscarActualizacionUseCase {
  private api = inject(ACTUALIZACION_API_REPOSITORY_TOKEN);
  private instalador = inject(INSTALADOR_REPOSITORY_TOKEN);

  async execute(): Promise<EstadoActualizacion> {
    const versionInstalada = await this.instalador.versionInstalada();
    const disponible = await this.api.consultarUltimaVersion();

    /*
     * Estrictamente mayor. Con >= la app ofrecería reinstalar la misma versión
     * cada vez que el operador abre el menú.
     *
     * Si la instalada es MAYOR que la del servidor no se ofrece nada: es una
     * build de prueba puesta a mano, y "actualizar" hacia atrás la reemplazaría
     * por una más vieja. Android además rechaza el downgrade.
     */
    const hayActualizacion = disponible !== null && disponible.versionCode > versionInstalada;

    return { versionInstalada, disponible, hayActualizacion };
  }
}
