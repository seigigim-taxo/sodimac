import { InjectionToken } from '@angular/core';

export interface DatabaseRepository {
  initialize(): Promise<void>;
}

export const DATABASE_REPOSITORY_TOKEN = new InjectionToken<DatabaseRepository>('DatabaseRepository');
