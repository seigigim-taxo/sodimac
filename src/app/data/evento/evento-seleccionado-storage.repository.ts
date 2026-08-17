import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { EventoSeleccionadoStorageRepository } from '../../domain/evento/repositories/evento-seleccionado-storage.repository';

/*
 * Preferences y no SQLite: es preferencia de sesión del dispositivo, del mismo
 * orden que la sesión del operador, y tiene que poder leerse en el arranque sin
 * depender de que la base local haya abierto bien.
 */
const EVENTO_SELECCIONADO_KEY = 'sodimac_evento_seleccionado';

@Injectable({ providedIn: 'root' })
export class CapacitorEventoSeleccionadoStorageRepository implements EventoSeleccionadoStorageRepository {
  async guardar(eventoId: number): Promise<void> {
    await Preferences.set({ key: EVENTO_SELECCIONADO_KEY, value: String(eventoId) });
  }

  async obtener(): Promise<number | null> {
    const stored = await Preferences.get({ key: EVENTO_SELECCIONADO_KEY });
    if (!stored.value) return null;
    const id = Number(stored.value);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  async limpiar(): Promise<void> {
    await Preferences.remove({ key: EVENTO_SELECCIONADO_KEY });
  }
}
