import { Injectable, inject } from '@angular/core';
import { CountingRepository } from '../../domain/counting/repositories/counting.repository';
import { CountingSession } from '../../domain/counting/models/counting-session.model';

@Injectable({ providedIn: 'root' })
export class GetCountingSessionsUseCase {
  private repository = inject(CountingRepository);

  async execute(): Promise<CountingSession[]> {
    return this.repository.getSessions();
  }
}
