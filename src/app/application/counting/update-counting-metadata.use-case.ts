import { Injectable, inject } from '@angular/core';
import { CountingRepository } from '../../domain/counting/repositories/counting.repository';
import { CountingSession } from '../../domain/counting/models/counting-session.model';

@Injectable({ providedIn: 'root' })
export class UpdateCountingMetadataUseCase {
  private repository = inject(CountingRepository);

  async execute(id: string, tag: string, zone: string): Promise<void> {
    const session = await this.repository.getSession(id);
    if (!session) throw new Error(`Session ${id} not found`);
    if (session.synced) throw new Error('Cannot edit a synced session');

    const updated: CountingSession = {
      ...session,
      tag,
      zone,
      edited: true,
      synced: false,
      updatedAt: new Date().toISOString(),
    };
    await this.repository.updateSession(updated);
  }
}
