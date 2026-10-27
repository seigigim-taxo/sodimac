import { Injectable, inject } from '@angular/core';
import { validarReabrir } from '../../domain/zonificacion/utils/reglas-zonificacion.utils';
import { ContextoAgendaZonificacionService } from './contexto-agenda-zonificacion.service';
import { AgendaRef, ResultadoAccion, rechazo } from './resultado-accion';

/*
 * Reabrir una zonificación confirmada: vuelve a BORRADOR y se puede editar de
 * nuevo (hay que confirmarla otra vez al terminar). La PDA hace lo mismo que el
 * SGO.
 */
@Injectable({ providedIn: 'root' })
export class ReabrirZonificacionUseCase {
  private contexto = inject(ContextoAgendaZonificacionService);

  async execute(agenda: AgendaRef): Promise<ResultadoAccion> {
    const identidad = await this.contexto.identidad();
    if (!identidad) return rechazo('SIN_SESION');

    const { estado, vista } = await this.contexto.cargar(agenda.idAgenda);
    const bloqueo = this.contexto.verificarEscritura(estado);
    if (bloqueo) return bloqueo;

    const valido = validarReabrir(vista.estado);
    if (!valido.ok) return rechazo(valido.codigo, valido.data);

    await this.contexto.encolar(agenda, identidad, 'REABRIR', {});
    return { ok: true };
  }
}
