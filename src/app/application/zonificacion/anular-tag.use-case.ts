import { Injectable, inject } from '@angular/core';
import { ZONIFICACION_LOCAL_REPOSITORY_TOKEN } from '../../domain/zonificacion/repositories/zonificacion-local.repository';
import { validarAnularTag } from '../../domain/zonificacion/utils/reglas-zonificacion.utils';
import { rangosParaReglas } from '../../domain/zonificacion/utils/vista-con-pendientes.utils';
import { ContextoAgendaZonificacionService } from './contexto-agenda-zonificacion.service';
import { AgendaRef, ResultadoAccion, rechazo } from './resultado-accion';

/*
 * Anular un TAG con motivo. Se valida lo que la app puede saber (número válido,
 * motivo suficiente, el TAG está en un rango y no está ya anulado); que el TAG
 * no tenga capturas en el conteo (TAG_CON_CAPTURAS) solo lo sabe el servidor y
 * lo rechazará si corresponde.
 *
 * No depende de que la zonificación esté en BORRADOR: igual que en el SGO, se
 * puede anular aunque esté confirmada.
 */
@Injectable({ providedIn: 'root' })
export class AnularTagUseCase {
  private local = inject(ZONIFICACION_LOCAL_REPOSITORY_TOKEN);
  private contexto = inject(ContextoAgendaZonificacionService);

  async execute(agenda: AgendaRef, numeroTag: number, motivo: string): Promise<ResultadoAccion> {
    const identidad = await this.contexto.identidad();
    if (!identidad) return rechazo('SIN_SESION');

    const catalogo = (await this.local.obtenerCatalogo())?.valor;
    if (!catalogo) return rechazo('SIN_CATALOGO');

    const { estado, vista } = await this.contexto.cargar(agenda.idAgenda);
    const bloqueo = this.contexto.verificarEscritura(estado);
    if (bloqueo) return bloqueo;

    const valido = validarAnularTag(
      numeroTag,
      motivo,
      rangosParaReglas(vista),
      vista.tagsAnulados.map((t) => t.numeroTag),
      catalogo.parametros.motivoLargoMinimo,
    );
    if (!valido.ok) return rechazo(valido.codigo, valido.data);

    await this.contexto.encolar(agenda, identidad, 'ANULAR_TAG', { numero_tag: numeroTag, motivo: motivo.trim() });
    return { ok: true };
  }
}
