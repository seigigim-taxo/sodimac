import { InjectionToken } from '@angular/core';
import { Session } from '../models/session.model';

export interface SessionStorageRepository {
  save(session: Session): Promise<void>;
  load(): Promise<Session | null>;
  clear(): Promise<void>;
}

export const SESSION_STORAGE_REPOSITORY_TOKEN = new InjectionToken<SessionStorageRepository>('SessionStorageRepository');
