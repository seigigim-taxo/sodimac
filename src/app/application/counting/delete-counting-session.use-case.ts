import { Injectable, inject } from '@angular/core';
import { CountingRepository } from '../../domain/counting/repositories/counting.repository';

@Injectable({ providedIn: 'root' })
export class DeleteCountingSessionUseCase {
  private repository = inject(CountingRepository);

  async execute(id: string): Promise<void> {
    const session = await this.repository.getSession(id);
    if (!session) throw new Error(`Session ${id} not found`);
    await this.repository.deleteSession(id);
  }
}
