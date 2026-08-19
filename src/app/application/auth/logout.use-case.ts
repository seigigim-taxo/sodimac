import { Injectable, inject } from '@angular/core';
import { SESSION_STORAGE_REPOSITORY_TOKEN } from '../../domain/auth/repositories/session-storage.repository';

@Injectable({ providedIn: 'root' })
export class LogoutUseCase {
  private sessionStorage = inject(SESSION_STORAGE_REPOSITORY_TOKEN);

  async execute(): Promise<void> {
    await this.sessionStorage.clear();
  }
}
