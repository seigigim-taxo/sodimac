import { Injectable, inject } from '@angular/core';
import { ASIGNACION_API_REPOSITORY_TOKEN } from '../../domain/asignacion/repositories/asignacion-api.repository';
import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';

/*
 * "¿Me toca otro conteo?" — lo que pregunta el operador que ya terminó el suyo
 * y quedó a la espera.
 *
 * No reabre nada de lo anterior: un conteo finalizado está cerrado y sus líneas
 * dejaron de ser editables. Lo que viene es trabajo nuevo, con su propia
 * muestra, y puede ser de otra jornada.
 */
@Injectable({ providedIn: 'root' })
export class BuscarNuevoConteoUseCase {
  private asignacionApi = inject(ASIGNACION_API_REPOSITORY_TOKEN);

  async execute(sucursalId: number, eventoFinalizadoId: number | null): Promise<AsignacionConteo | null> {
    if (sucursalId <= 0) throw new Error('Tienda inválida');
    return this.asignacionApi.consultarNuevaAsignacion(sucursalId, eventoFinalizadoId);
  }
}
