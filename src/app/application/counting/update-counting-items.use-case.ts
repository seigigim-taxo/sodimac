import { Injectable, inject } from '@angular/core';
import { CountingRepository } from '../../domain/counting/repositories/counting.repository';
import { CountingSession } from '../../domain/counting/models/counting-session.model';
import { calculateCountingTotals } from '../../domain/counting/utils/counting-totals.utils';

@Injectable({ providedIn: 'root' })
export class UpdateCountingItemsUseCase {
  private repository = inject(CountingRepository);

  async execute(session: CountingSession): Promise<CountingSession> {
    const totals = calculateCountingTotals(session.items);
    const updated: CountingSession = {
      ...session,
      ...totals,
      updatedAt: new Date().toISOString(),
    };
    await this.repository.updateSession(updated);
    return updated;
  }
}
