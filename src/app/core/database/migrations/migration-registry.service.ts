import { Injectable, inject } from '@angular/core';
import { Migration, MIGRATIONS_TOKEN } from './migration.model';

@Injectable({ providedIn: 'root' })
export class MigrationRegistry {
  private migrations = inject(MIGRATIONS_TOKEN);

  getMigrations(): Migration[] {
    return [...this.migrations].sort((a, b) => a.version - b.version);
  }

  getLatestVersion(): number {
    return this.migrations.reduce((max, m) => Math.max(max, m.version), 0);
  }
}
