import { Injectable, inject } from '@angular/core';
import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';
import { Session } from '../../domain/auth/models/session.model';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';
import { BuscarNuevoConteoUseCase } from './buscar-nuevo-conteo.use-case';
import { ReabrirEventoUseCase } from '../conteo/reabrir-evento.use-case';

export type ResultadoBuscarOReabrir =
  /** El SGO no tiene nada nuevo, y no había nada propio que reabrir. */
  | { tipo: 'SIN_NOVEDAD' }
  /** Mismo codigo_muestra que un evento propio recién cerrado: se deshizo el cierre. */
  | { tipo: 'REABIERTO'; asignacion: AsignacionConteo }
  /** Codigo_muestra distinto: es jornada nueva (u otra tienda). */
  | { tipo: 'NUEVO'; asignacion: AsignacionConteo };

/*
 * "¿Me toca otro conteo?", pero sabiendo distinguir un caso que
 * BuscarNuevoConteoUseCase por sí solo no puede: que el SGO todavía no haya
 * programado nada porque el conteo que YA le pertenece a este operador —el que
 * acaba de cerrar— sigue siendo lo último asignado.
 *
 * Uso exclusivo del botón "Actualizar" de Home. "Actualizar maestra" del menú
 * lateral llama a BuscarNuevoConteoUseCase directo y no pasa por acá: ese botón
 * puede dispararse desde cualquier pantalla, no solo después de cerrar un
 * conteo, y no le corresponde reabrir nada por su cuenta.
 */
@Injectable({ providedIn: 'root' })
export class BuscarOReabrirConteoUseCase {
  private buscarUC  = inject(BuscarNuevoConteoUseCase);
  private reabrirUC = inject(ReabrirEventoUseCase);
  private eventoRepo = inject(EVENTO_REPOSITORY_TOKEN);

  async execute(session: Session): Promise<ResultadoBuscarOReabrir> {
    const { asignacion, eventoCoincidenteId } = await this.buscarUC.execute(session);

    if (asignacion) return { tipo: 'NUEVO', asignacion };
    if (eventoCoincidenteId === null) return { tipo: 'SIN_NOVEDAD' };

    /*
     * Coincide con un evento propio. Reabrir solo tiene sentido si ese evento
     * es el que la PDA misma cerró y el SGO no llegó a analizar todavía —
     * EN_ANALISIS. Si sigue ABIERTO/RECONTEO no hay nada que deshacer, y si ya
     * está CERRADO es porque el SGO se pronunció: esa decisión no se pisa.
     */
    const evento = await this.eventoRepo.getById(eventoCoincidenteId);
    if (!evento || evento.estado !== 'EN_ANALISIS') return { tipo: 'SIN_NOVEDAD' };

    const reabierto = await this.reabrirUC.execute(eventoCoincidenteId);

    return {
      tipo: 'REABIERTO',
      asignacion: {
        eventoId:        reabierto.id,
        sucursalId:      reabierto.sucursalId,
        nombre:          reabierto.nombre,
        fechaProgramada: reabierto.fechaProgramada,
      },
    };
  }
}
