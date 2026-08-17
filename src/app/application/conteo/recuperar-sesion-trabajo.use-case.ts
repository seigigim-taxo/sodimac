import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';
import { EVENTO_SELECCIONADO_STORAGE_TOKEN } from '../../domain/evento/repositories/evento-seleccionado-storage.repository';
import { ZONA_REPOSITORY_TOKEN } from '../../domain/zona/repositories/zona.repository';
import { Evento } from '../../domain/evento/models/evento.model';
import { Zona } from '../../domain/zona/models/zona.model';

/*
 * `conteo` en null significa "hay evento pero no hay TAG abierto": el operador
 * eligió evento y todavía no contaba nada, o el TAG ya se cerró.
 */
export interface SesionTrabajoRestaurada {
  evento: Evento;
  conteo: {
    zona:             Zona;
    tag:              string;
    ubicacionId:      number;
    ubicacionPrecisa: string;
  } | null;
}

/*
 * Reconstruye el estado de trabajo desde lo que sí sobrevive a un apagón:
 * SQLite (las líneas EN_CURSO) y Preferences (el evento elegido).
 *
 * El conteo manda sobre la preferencia. Si hay un TAG abierto, su evento es el
 * que corresponde restaurar, aunque la preferencia apunte a otro — las líneas
 * ya escritas pesan más que una selección de pantalla.
 */
@Injectable({ providedIn: 'root' })
export class RecuperarSesionTrabajoUseCase {
  private conteoRepo    = inject(CONTEO_REPOSITORY_TOKEN);
  private eventoRepo    = inject(EVENTO_REPOSITORY_TOKEN);
  private zonaRepo      = inject(ZONA_REPOSITORY_TOKEN);
  private eventoStorage = inject(EVENTO_SELECCIONADO_STORAGE_TOKEN);

  async execute(operadorId: number, pdaId: number): Promise<SesionTrabajoRestaurada | null> {
    const sesion = await this.conteoRepo.getSesionEnCurso(operadorId, pdaId);

    const eventoId = sesion?.eventoId ?? (await this.eventoStorage.obtener());
    if (!eventoId) return null;

    const evento = await this.eventoRepo.getById(eventoId);
    if (!evento) return null;

    /*
     * Un evento que ya pasó a EN_ANALISIS o CERRADO no se restaura: las
     * pantallas de conteo lo rechazan igual y volverlo a poner solo alimenta el
     * mismo ciclo de redirecciones que esto viene a evitar.
     */
    if (evento.estado === 'EN_ANALISIS' || evento.estado === 'CERRADO') return null;

    if (!sesion) return { evento, conteo: null };

    const zonas = await this.zonaRepo.getBySucursal(evento.sucursalId);
    const zona  = zonas.find((z) => z.id === sesion.zonaId);
    // Sin la zona no se puede reconstruir la sesión de TAG, pero el evento sí sirve.
    if (!zona) return { evento, conteo: null };

    return {
      evento,
      conteo: {
        zona,
        tag:              sesion.tag,
        ubicacionId:      sesion.ubicacionId,
        ubicacionPrecisa: sesion.ubicacionPrecisa,
      },
    };
  }
}
