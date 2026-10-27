import { Injectable, inject } from '@angular/core';
import { ListaAgendas } from '../../domain/zonificacion/models/estado-agenda.model';
import { ZONIFICACION_API_REPOSITORY_TOKEN } from '../../domain/zonificacion/repositories/zonificacion-api.repository';
import { ZONIFICACION_LOCAL_REPOSITORY_TOKEN } from '../../domain/zonificacion/repositories/zonificacion-local.repository';
import { IdentidadZonificacionService } from './identidad-zonificacion.service';
import { OrigenDatos } from './cargar-catalogo-zonificacion.use-case';

export interface AgendasCargadas {
  lista: ListaAgendas | null;
  origen: OrigenDatos;
  fechaDescarga: string | null;
  /* El fallo de la descarga, si lo hubo (para mostrar "sin conexión" y no un error). */
  error: unknown;
}

/*
 * Las agendas que el operador puede zonificar: las mismas que le entrega la
 * preparación (asignadas a él, hoy y siguiente jornada), con un resumen de su
 * zonificación. Sin red se muestra la última lista descargada.
 *
 * Una lista vacía del servidor es una respuesta válida ("no tienes agendas
 * asignadas") y NO se reemplaza por la copia: si el servidor dice que no hay,
 * no hay.
 */
@Injectable({ providedIn: 'root' })
export class CargarAgendasZonificacionUseCase {
  private api = inject(ZONIFICACION_API_REPOSITORY_TOKEN);
  private local = inject(ZONIFICACION_LOCAL_REPOSITORY_TOKEN);
  private identidadService = inject(IdentidadZonificacionService);

  /*
   * La última lista descargada, sin tocar la red: para pintar la pantalla al instante mientras
   * `execute()` pide la lista al servidor. Null si nunca se descargó una.
   */
  async copia(): Promise<AgendasCargadas | null> {
    const identidad = await this.identidadService.obtener();
    if (!identidad) return null;
    const copia = await this.local.obtenerListaAgendas(identidad.operadorLogin);
    return copia ? { lista: copia.valor, origen: 'COPIA', fechaDescarga: copia.fechaDescarga, error: null } : null;
  }

  async execute(): Promise<AgendasCargadas> {
    const identidad = await this.identidadService.obtener();
    if (!identidad) return { lista: null, origen: 'NINGUNO', fechaDescarga: null, error: null };

    try {
      const lista = await this.api.listarAgendas(identidad);
      await this.local.guardarListaAgendas(identidad.operadorLogin, lista);
      return { lista, origen: 'SERVIDOR', fechaDescarga: null, error: null };
    } catch (error) {
      const copia = await this.local.obtenerListaAgendas(identidad.operadorLogin);
      return copia
        ? { lista: copia.valor, origen: 'COPIA', fechaDescarga: copia.fechaDescarga, error }
        : { lista: null, origen: 'NINGUNO', fechaDescarga: null, error };
    }
  }
}
