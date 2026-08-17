import { Injectable, inject, isDevMode } from '@angular/core';
import { AsignacionApiRepository } from '../../domain/asignacion/repositories/asignacion-api.repository';
import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';

const TAG = '[MockAsignacionApi]';

/*
 * Mock del "¿hay conteo nuevo?" mientras el SGO no expone el endpoint.
 *
 * ESTE ES EL ÚNICO ARCHIVO A REEMPLAZAR cuando llegue el real: se implementa
 * AsignacionApiRepository contra HTTP, se cambia el provider en main.ts y nada
 * más se entera.
 *
 * Resuelve contra la base local en vez de inventar datos ni contar intentos:
 * si la preparación ya dejó otro evento ABIERTO de la tienda, ese es el trabajo
 * que sigue. Así la pantalla se prueba con datos reales y el día que responda
 * el SGO el comportamiento observable es el mismo.
 */
@Injectable({ providedIn: 'root' })
export class MockAsignacionApiRepository implements AsignacionApiRepository {
  private eventoRepo = inject(EVENTO_REPOSITORY_TOKEN);

  async consultarNuevaAsignacion(
    sucursalId: number,
    eventoFinalizadoId: number | null,
  ): Promise<AsignacionConteo | null> {
    const eventos = await this.eventoRepo.getBySucursal(sucursalId);

    const candidato = eventos.find(
      (e) => e.estado === 'ABIERTO' && e.id !== eventoFinalizadoId
    );

    if (!candidato) {
      if (isDevMode()) console.log(`${TAG} sin asignación nueva para la tienda ${sucursalId}`);
      return null;
    }

    if (isDevMode()) console.log(`${TAG} asigna el evento ${candidato.id}`);
    return {
      eventoId:        candidato.id,
      nombre:          candidato.nombre,
      fechaProgramada: candidato.fechaProgramada,
    };
  }
}
