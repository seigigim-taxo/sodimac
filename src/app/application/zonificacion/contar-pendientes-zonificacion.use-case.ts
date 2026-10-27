import { Injectable, inject } from '@angular/core';
import { ZONIFICACION_LOCAL_REPOSITORY_TOKEN } from '../../domain/zonificacion/repositories/zonificacion-local.repository';

export interface ConteoZonificacion {
  /* Operaciones que aún no salieron: el aviso rojo "Zonificación no enviada (N)" del Inicio. */
  pendientes: number;
  /* Operaciones que el servidor rechazó y esperan a que el operador las descarte: su propio aviso. */
  rechazadas: number;
}

/* Lo que el Inicio necesita saber de zonificación para sus avisos. */
@Injectable({ providedIn: 'root' })
export class ContarPendientesZonificacionUseCase {
  private local = inject(ZONIFICACION_LOCAL_REPOSITORY_TOKEN);

  async execute(): Promise<ConteoZonificacion> {
    const [pendientes, rechazadas] = await Promise.all([this.local.contarPendientes(), this.local.contarRechazadas()]);
    return { pendientes, rechazadas };
  }
}
