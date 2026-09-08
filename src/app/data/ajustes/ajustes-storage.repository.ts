import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { AjustesStorageRepository } from '../../domain/ajustes/repositories/ajustes-storage.repository';
import { ModoCaptura } from '../../domain/conteo/models/modo-captura.model';

const SINCRONIZACION_AUTOMATICA_KEY = 'sodimac_sincronizacion_automatica';
const MODO_CAPTURA_PREFERIDO_KEY = 'sodimac_modo_captura_preferido';

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

  async cargarModoCapturaPreferido(): Promise<ModoCaptura | null> {
    const stored = await Preferences.get({ key: MODO_CAPTURA_PREFERIDO_KEY });
    if (stored.value === 'uno' || stored.value === 'cantidad') return stored.value;
    return null;
  }

  async guardarModoCapturaPreferido(modo: ModoCaptura): Promise<void> {
    await Preferences.set({ key: MODO_CAPTURA_PREFERIDO_KEY, value: modo });
  }
}
