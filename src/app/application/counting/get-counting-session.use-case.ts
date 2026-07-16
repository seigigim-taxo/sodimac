import { Injectable, inject } from '@angular/core';
import { CountingRepository } from '../../domain/counting/repositories/counting.repository';
import { CountingSession } from '../../domain/counting/models/counting-session.model';

@Injectable({ providedIn: 'root' })
export class GetCountingSessionUseCase {
  private repository = inject(CountingRepository);

  async execute(id: string): Promise<CountingSession | null> {
    return this.repository.getSession(id);
  }
}
