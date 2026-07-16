import { Injectable, inject } from '@angular/core';
import { CountingRepository } from '../../domain/counting/repositories/counting.repository';
import { CountingSession } from '../../domain/counting/models/counting-session.model';
import { calculateCountingTotals } from '../../domain/counting/utils/counting-totals.utils';

@Injectable({ providedIn: 'root' })
export class SaveCountingSessionUseCase {
  private repository = inject(CountingRepository);

  async execute(session: CountingSession): Promise<void> {
    const totals = calculateCountingTotals(session.items);
    const updated: CountingSession = {
      ...session,
      ...totals,
      updatedAt: new Date().toISOString(),
    };
    const existing = await this.repository.getSession(updated.id);
    if (existing) {
      await this.repository.updateSession(updated);
    } else {
      await this.repository.createSession(updated);
    }
  }
}
