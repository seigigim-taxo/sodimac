import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { AjustesStorageRepository } from '../../domain/ajustes/repositories/ajustes-storage.repository';

const SINCRONIZACION_AUTOMATICA_KEY = 'sodimac_sincronizacion_automatica';

@Injectable({ providedIn: 'root' })
export class CapacitorAjustesStorageRepository implements AjustesStorageRepository {
  async cargarSincronizacionAutomatica(): Promise<boolean | null> {
    const stored = await Preferences.get({ key: SINCRONIZACION_AUTOMATICA_KEY });
    if (stored.value === 'true')  return true;
    if (stored.value === 'false') return false;
    return null;
  }

  async guardarSincronizacionAutomatica(activa: boolean): Promise<void> {
    await Preferences.set({ key: SINCRONIZACION_AUTOMATICA_KEY, value: String(activa) });
  }
}
