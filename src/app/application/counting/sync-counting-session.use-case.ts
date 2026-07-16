import { Injectable, inject } from '@angular/core';
import { CountingRepository } from '../../domain/counting/repositories/counting.repository';

@Injectable({ providedIn: 'root' })
export class SyncCountingSessionUseCase {
  private repository = inject(CountingRepository);

  async execute(id: string): Promise<void> {
    const session = await this.repository.getSession(id);
    if (!session) throw new Error(`Session ${id} not found`);
    if (session.synced) throw new Error('Session is already synced');
    if (session.status !== 'finalized') throw new Error('Only finalized sessions can be synced');

    await this.repository.markSynced(id);
  }
}
