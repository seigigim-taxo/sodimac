import { Injectable, inject } from '@angular/core';
import { SESSION_STORAGE_REPOSITORY_TOKEN } from '../../domain/auth/repositories/session-storage.repository';
import { Session } from '../../domain/auth/models/session.model';

@Injectable({ providedIn: 'root' })
export class PersistSessionUseCase {
  private sessionStorage = inject(SESSION_STORAGE_REPOSITORY_TOKEN);

  execute(session: Session): Promise<void> {
    return this.sessionStorage.save(session);
  }
}
