import { InjectionToken } from '@angular/core';

export interface DevSeederRepository {
  seed(operadorId: number): Promise<void>;
}

export const DEV_SEEDER_REPOSITORY_TOKEN = new InjectionToken<DevSeederRepository>('DevSeederRepository');
