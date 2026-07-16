import { Injectable, inject } from '@angular/core';
import { CountingSession } from '../../domain/counting/models/counting-session.model';
import { SaveCountingSessionUseCase } from './save-counting-session.use-case';

@Injectable({ providedIn: 'root' })
export class FinalizeCountingSessionUseCase {
  private saveSession = inject(SaveCountingSessionUseCase);

  async execute(session: CountingSession): Promise<CountingSession> {
    if (session.items.length === 0) {
      throw new Error('No items to finalize');
    }
    if (session.status !== 'in-progress') {
      throw new Error('Session is not in progress');
    }

    const finalized: CountingSession = {
      ...session,
      status: 'finalized',
      updatedAt: new Date().toISOString(),
    };
    await this.saveSession.execute(finalized);
    return finalized;
  }
}
