import { Injectable, inject } from '@angular/core';
import { ZONIFICACION_LOCAL_REPOSITORY_TOKEN } from '../../domain/zonificacion/repositories/zonificacion-local.repository';
import { validarConfirmarLocal } from '../../domain/zonificacion/utils/reglas-zonificacion.utils';
import { ContextoAgendaZonificacionService } from './contexto-agenda-zonificacion.service';
import { AgendaRef, ResultadoAccion, rechazo } from './resultado-accion';

/*
 * Confirmar la zonificación de una agenda. La app revisa lo que puede (no está
 * ya confirmada, hay rangos con TAG, todos tienen tipo de ubicación, no se
 * cruzan); el servidor revisa además que ningún TAG ya capturado quede sin
 * cobertura (TAGS_SIN_COBERTURA).
 *
 * Confirmar entra a la misma cola que los rangos y sale al final de ellos: la
 * cola de la agenda sale en orden y de a una operación, así que el servidor
 * confirma ya con todos los rangos aplicados y no sobre un estado viejo.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmarZonificacionUseCase {
  private local = inject(ZONIFICACION_LOCAL_REPOSITORY_TOKEN);
  private contexto = inject(ContextoAgendaZonificacionService);

  async execute(agenda: AgendaRef): Promise<ResultadoAccion> {
    const identidad = await this.contexto.identidad();
    if (!identidad) return rechazo('SIN_SESION');

    const catalogo = (await this.local.obtenerCatalogo())?.valor;
    if (!catalogo) return rechazo('SIN_CATALOGO');

    const { estado, vista } = await this.contexto.cargar(agenda.idAgenda);
    const bloqueo = this.contexto.verificarEscritura(estado);
    if (bloqueo) return bloqueo;

    // El tipo de ubicación de cada rango sale de su zona en el catálogo.
    const rangos = vista.rangos.map((r) => ({
      id: r.id,
      tagDesde: r.tagDesde,
      tagHasta: r.tagHasta,
      idTipoUbicacion: catalogo.zonas.find((z) => z.codigoZona === r.codigoZona)?.idTipoUbicacion ?? null,
    }));
    const valido = validarConfirmarLocal(vista.estado, rangos, vista.tagsAnulados.map((t) => t.numeroTag));
    if (!valido.ok) return rechazo(valido.codigo, valido.data);

    await this.contexto.encolar(agenda, identidad, 'CONFIRMAR', {});
    return { ok: true };
  }
}
