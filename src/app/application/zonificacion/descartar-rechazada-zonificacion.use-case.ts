import { Injectable, inject } from '@angular/core';
import { ZONIFICACION_API_REPOSITORY_TOKEN } from '../../domain/zonificacion/repositories/zonificacion-api.repository';
import { ZONIFICACION_LOCAL_REPOSITORY_TOKEN } from '../../domain/zonificacion/repositories/zonificacion-local.repository';
import { IdentidadZonificacionService } from './identidad-zonificacion.service';

/*
 * El operador vio por qué el servidor rechazó una operación y la descarta. Sale
 * de la cola y la agenda vuelve a pedir su estado: el rechazo suele venir de que
 * algo cambió en el servidor (otra PDA, el SGO) y lo que la pantalla muestre
 * tiene que ser lo de allá.
 *
 * Solo se descartan operaciones RECHAZADAS: una PENDIENTE todavía puede salir y
 * quitarla en silencio perdería lo que el operador hizo.
 */
@Injectable({ providedIn: 'root' })
export class DescartarRechazadaZonificacionUseCase {
  private api = inject(ZONIFICACION_API_REPOSITORY_TOKEN);
  private local = inject(ZONIFICACION_LOCAL_REPOSITORY_TOKEN);
  private identidadService = inject(IdentidadZonificacionService);

  async execute(idOperacion: number): Promise<boolean> {
    const op = await this.local.obtenerOperacion(idOperacion);
    if (!op || op.estado !== 'RECHAZADO') return false;

    await this.local.eliminar(op.id);
    await this.refrescarEstado(op.idAgenda, op.numeroAgenda);
    return true;
  }

  /* Descarta todas las rechazadas de una vez. Devuelve cuántas quitó. */
  async descartarTodas(): Promise<number> {
    const rechazadas = await this.local.listarRechazadas();
    const agendas = new Map<number, string>();
    for (const op of rechazadas) {
      await this.local.eliminar(op.id);
      agendas.set(op.idAgenda, op.numeroAgenda);
    }
    // Una vez por agenda, no una por operación.
    for (const [idAgenda, numeroAgenda] of agendas) {
      await this.refrescarEstado(idAgenda, numeroAgenda);
    }
    return rechazadas.length;
  }

  private async refrescarEstado(idAgenda: number, numeroAgenda: string): Promise<void> {
    const identidad = await this.identidadService.obtener();
    if (!identidad) return;
    try {
      const estado = await this.api.obtenerEstado(identidad, idAgenda, numeroAgenda);
      await this.local.guardarEstado(estado);
    } catch (err) {
      console.error('[Zonificacion] no se pudo refrescar el estado tras descartar:', err);
    }
  }
}
