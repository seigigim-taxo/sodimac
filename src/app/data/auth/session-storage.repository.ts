import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { SessionStorageRepository } from '../../domain/auth/repositories/session-storage.repository';
import { Session } from '../../domain/auth/models/session.model';
import { SESSION_KEY } from '../../domain/auth/constants/session.constants';

@Injectable({ providedIn: 'root' })
export class CapacitorSessionStorageRepository implements SessionStorageRepository {
  async save(session: Session): Promise<void> {
    await Preferences.set({ key: SESSION_KEY, value: JSON.stringify(session) });
  }

  async load(): Promise<Session | null> {
    const stored = await Preferences.get({ key: SESSION_KEY });
    return stored.value ? (JSON.parse(stored.value) as Session) : null;
  }

  async clear(): Promise<void> {
    await Preferences.remove({ key: SESSION_KEY });
  }
}
