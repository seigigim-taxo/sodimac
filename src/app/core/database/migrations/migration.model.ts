import { InjectionToken } from '@angular/core';

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export const MIGRATIONS_TOKEN = new InjectionToken<Migration[]>('Migrations');

