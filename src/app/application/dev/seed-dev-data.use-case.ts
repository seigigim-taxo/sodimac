import { Injectable, inject } from '@angular/core';
import { DEV_SEEDER_REPOSITORY_TOKEN } from '../../domain/dev/repositories/dev-seeder.repository';

@Injectable({ providedIn: 'root' })
export class SeedDevDataUseCase {
  private devSeeder = inject(DEV_SEEDER_REPOSITORY_TOKEN);

  async execute(operadorId: number): Promise<void> {
    await this.devSeeder.seed(operadorId);
  }
}
