import { Injectable, inject } from '@angular/core';
import { SESSION_STORAGE_REPOSITORY_TOKEN } from '../../domain/auth/repositories/session-storage.repository';
import { Session } from '../../domain/auth/models/session.model';

@Injectable({ providedIn: 'root' })
export class LoadSessionUseCase {
  private sessionStorage = inject(SESSION_STORAGE_REPOSITORY_TOKEN);

  execute(): Promise<Session | null> {
    return this.sessionStorage.load();
  }
}
