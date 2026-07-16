import { Injectable, inject } from '@angular/core';
import { CountingRepository } from '../../domain/counting/repositories/counting.repository';
import { CountingSession } from '../../domain/counting/models/counting-session.model';

@Injectable({ providedIn: 'root' })
export class ReopenCountingSessionUseCase {
  private repository = inject(CountingRepository);

  async execute(id: string): Promise<void> {
    const session = await this.repository.getSession(id);
    if (!session) throw new Error(`Session ${id} not found`);
    if (session.synced) throw new Error('Cannot reopen a synced session');
    if (session.status !== 'finalized') throw new Error('Only finalized sessions can be reopened');

    const reopened: CountingSession = {
      ...session,
      status: 'in-progress',
      edited: true,
      synced: false,
      updatedAt: new Date().toISOString(),
    };
    await this.repository.updateSession(reopened);
  }
}
