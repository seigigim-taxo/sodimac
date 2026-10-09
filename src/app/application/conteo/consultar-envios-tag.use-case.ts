import { Injectable, inject } from '@angular/core';
import { SINCRONIZACION_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
import { EstadoEnvioTag, bloqueaEdicion } from '../../domain/sincronizacion/models/estado-envio-tag.model';

/*
 * De la lista de TAGs, cuáles NO se pueden modificar porque el servidor los
 * recibió o pudo haberlos recibido (ver EstadoEnvioTag), con el estado que lo
 * causa.
 *
 * Solo mira los FINALIZADOS: un EN_CURSO no se envió todavía y uno SINCRONIZADO
 * ya se sabe cerrado. Sirve para que la pantalla no ofrezca Editar/Eliminar
 * donde la regla los va a rechazar; la regla en sí vive en ReabrirTagUseCase y
 * DeleteConteoSesionUseCase, que no confían en la pantalla.
 *
 * Si no se puede consultar un TAG, se lo omite: no se dice que está bloqueado
 * sin saberlo, y de todos modos los casos de uso lo vuelven a verificar.
 */
@Injectable({ providedIn: 'root' })
export class ConsultarEnviosTagUseCase {
  private sincronizacionRepo = inject(SINCRONIZACION_REPOSITORY_TOKEN);

  async execute(conteos: ConteoResumen[]): Promise<Map<string, EstadoEnvioTag>> {
    const bloqueados = new Map<string, EstadoEnvioTag>();

    await Promise.all(conteos
      .filter((c) => c.estado === 'FINALIZADO')
      .map(async (c) => {
        try {
          const { estado } = await this.sincronizacionRepo.estadoEnvioTag(c.conteoId, c.ubicacionId);
          if (bloqueaEdicion(estado)) bloqueados.set(clavePorTag(c), estado);
        } catch (err) {
          console.error('[ConsultarEnviosTag] no se pudo consultar', c.conteoId, c.ubicacionId, err);
        }
      }));

    return bloqueados;
  }
}

/* Un TAG es la ronda + la ubicación; coincide con lo que consulta el repositorio. */
export function clavePorTag(c: Pick<ConteoResumen, 'conteoId' | 'ubicacionId'>): string {
  return `${c.conteoId}-${c.ubicacionId}`;
}
