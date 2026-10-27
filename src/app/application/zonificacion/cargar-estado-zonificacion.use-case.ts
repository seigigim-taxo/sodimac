import { Injectable, inject } from '@angular/core';
import { EstadoAgenda } from '../../domain/zonificacion/models/estado-agenda.model';
import { VistaZonificacion } from '../../domain/zonificacion/models/vista-zonificacion.model';
import { ZONIFICACION_API_REPOSITORY_TOKEN } from '../../domain/zonificacion/repositories/zonificacion-api.repository';
import { ZONIFICACION_LOCAL_REPOSITORY_TOKEN } from '../../domain/zonificacion/repositories/zonificacion-local.repository';
import { OrigenDatos } from './cargar-catalogo-zonificacion.use-case';
import { ContextoAgendaZonificacionService } from './contexto-agenda-zonificacion.service';
import { AgendaRef } from './resultado-accion';

export interface EstadoCargado {
  estado: EstadoAgenda | null;
  /* El estado con lo pendiente de envío aplicado encima: lo que se muestra. */
  vista: VistaZonificacion;
  origen: OrigenDatos;
  fechaDescarga: string | null;
  error: unknown;
}

/*
 * El resumen de una agenda. Con red se pide el estado al servidor y se guarda;
 * sin red se usa la última copia. En los dos casos se le aplica encima lo que el
 * operador hizo y todavía no salió, para que vea sus rangos con la marca
 * "pendiente de envío".
 */
@Injectable({ providedIn: 'root' })
export class CargarEstadoZonificacionUseCase {
  private api = inject(ZONIFICACION_API_REPOSITORY_TOKEN);
  private local = inject(ZONIFICACION_LOCAL_REPOSITORY_TOKEN);
  private contexto = inject(ContextoAgendaZonificacionService);

  async execute(agenda: AgendaRef): Promise<EstadoCargado> {
    let origen: OrigenDatos = 'SERVIDOR';
    let fechaDescarga: string | null = null;
    let error: unknown = null;

    const identidad = await this.contexto.identidad();
    if (identidad) {
      try {
        const estado = await this.api.obtenerEstado(identidad, agenda.idAgenda, agenda.numeroAgenda);
        await this.local.guardarEstado(estado);
      } catch (err) {
        error = err;
        origen = 'COPIA';
      }
    } else {
      origen = 'COPIA';
    }

    const { estado, vista } = await this.contexto.cargar(agenda.idAgenda);
    if (origen === 'COPIA') {
      const copia = await this.local.obtenerEstado(agenda.idAgenda);
      fechaDescarga = copia?.fechaDescarga ?? null;
      if (!copia) origen = 'NINGUNO';
    }
    return { estado, vista, origen, fechaDescarga, error };
  }
}
