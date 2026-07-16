import { Injectable, inject } from '@angular/core';
import { CountingRepository } from '../../domain/counting/repositories/counting.repository';
import { CountingSession } from '../../domain/counting/models/counting-session.model';
import { generateUuid } from '../../shared/utils/uuid.utils';

@Injectable({ providedIn: 'root' })
export class CreateCountingSessionUseCase {
  private repository = inject(CountingRepository);

  async execute(tag: string, zone: string): Promise<CountingSession> {
    const now = new Date().toISOString();
    const session: CountingSession = {
      id: generateUuid(),
      tag,
      zone,
      status: 'in-progress',
      synced: false,
      edited: false,
      createdAt: now,
      updatedAt: now,
      items: [],
      totalItems: 0,
      totalQuantity: 0,
    };
    await this.repository.createSession(session);
    return session;
  }
}
