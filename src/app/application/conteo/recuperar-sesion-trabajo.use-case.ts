import { Injectable, inject } from '@angular/core';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';
import { EVENTO_SELECCIONADO_STORAGE_TOKEN } from '../../domain/evento/repositories/evento-seleccionado-storage.repository';
import { ZONA_REPOSITORY_TOKEN } from '../../domain/zona/repositories/zona.repository';
import { Evento } from '../../domain/evento/models/evento.model';
import { Zona } from '../../domain/zona/models/zona.model';
import { hoySql } from '../../shared/utils/fecha.utils';

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

    /*
     * Tres fuentes, en orden de peso. El logout borra la preferencia a
     * propósito (la PDA se pasa entre turnos), así que tras cerrar sesión con
     * todos los TAGs finalizados las dos primeras quedan vacías y el evento se
     * perdía: la pantalla de resumen filtra por evento seleccionado y aparecía
     * en blanco pese a tener los conteos en la base. La tercera cubre ese caso
     * sin reabrir el de otro operador — va acotada a operador + PDA.
     */
    const eventoId =
      sesion?.eventoId ??
      (await this.eventoStorage.obtener()) ??
      (await this.conteoRepo.getEventoIdUltimoTrabajo(operadorId, pdaId));
    if (!eventoId) return null;

    const evento = await this.eventoRepo.getById(eventoId);
    if (!evento) return null;

    /*
     * Cada jornada arranca limpia. Un evento de otro día no se restaura, aunque
     * siga ABIERTO en la base y aunque haya quedado un TAG a medio contar.
     *
     * Sin esto, el operador que dejó un TAG abierto el lunes se lo encontraba
     * abierto el martes —después del cierre de sesión, del login y de la
     * descarga— y seguía sumando unidades sobre la jornada equivocada. Las tres
     * fuentes de arriba sobreviven al cambio de día, así que el corte va acá,
     * donde ya están resueltas.
     */
    if (evento.fechaProgramada.slice(0, 10) !== hoySql()) return null;

    /*
     * Un evento terminado se restaura igual, pero SIN sesión de TAG: no hay
     * nada que seguir contando. Antes se devolvía null y eso dejaba al
     * operador sin salida en Inicio: esa pantalla necesita el evento
     * seleccionado para mostrar "a la espera de un nuevo conteo" y el botón
     * de buscar trabajo. Sin evento caía al caso contrario —"Iniciar conteo"
     * deshabilitado— y no había forma de seguir.
     */
    if (evento.estado === 'EN_ANALISIS' || evento.estado === 'CERRADO') {
      return { evento, conteo: null };
    }

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
