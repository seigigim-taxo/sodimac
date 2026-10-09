import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { SINCRONIZACION_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { EstadoConteo } from '../../domain/conteo/models/estado-conteo.model';
import { bloqueaEdicion, mensajeBloqueo } from '../../domain/sincronizacion/models/estado-envio-tag.model';

/*
 * Borra lo contado en un TAG. `conteoId` es la RONDA a la que pertenecen las
 * líneas, no el evento: son ids distintos y ambos son números, así que el
 * compilador no avisa si se confunden.
 */
@Injectable({ providedIn: 'root' })
export class DeleteConteoSesionUseCase {
  private conteoRepo = inject(CONTEO_REPOSITORY_TOKEN);
  private sincronizacionRepo = inject(SINCRONIZACION_REPOSITORY_TOKEN);

  async execute(
    conteoId: number, ubicacionId: number, operadorId: number, pdaId: number, estado: EstadoConteo
  ): Promise<void> {
    /*
     * Un TAG sincronizado ya viajó al servidor: borrarlo acá dejaría a la PDA
     * sin registro de algo que el SGO sí tiene. La pantalla no ofrece la acción
     * en ese estado, pero la regla vive acá y no en la vista.
     */
    if (estado === 'SINCRONIZADO') {
      throw new Error('Este TAG ya se sincronizó y no se puede eliminar.');
    }

    /*
     * Lo mismo si el servidor lo recibió o pudo haberlo recibido: borrarlo local
     * dejaría datos en el servidor que la PDA ya no tiene cómo explicar.
     */
    const envio = await this.sincronizacionRepo.estadoEnvioTag(conteoId, ubicacionId);
    if (bloqueaEdicion(envio.estado)) throw new Error(mensajeBloqueo(envio.estado));

    await this.conteoRepo.deleteSesion(conteoId, ubicacionId, operadorId, pdaId, estado);

    /*
     * Descartar un TAG también descarta su envío fallido: si la fila quedara, los
     * reintentos automáticos volverían a mandar al servidor lo que el operador
     * borró. Si la limpieza falla no se le dice que el borrado falló —ya se
     * hizo—; al abrir la cola vuelve a intentarse.
     */
    try {
      await this.sincronizacionRepo.limpiarEnviosHuerfanos();
    } catch (err) {
      console.error('[DeleteConteoSesion] no se pudo limpiar el envío del TAG borrado:', err);
    }
  }
}
