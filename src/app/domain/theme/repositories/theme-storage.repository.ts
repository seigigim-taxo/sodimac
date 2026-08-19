import { InjectionToken } from '@angular/core';
import { Theme } from '../models/theme.model';
export type { Theme };

export interface ThemeStorageRepository {
  load(): Promise<Theme | null>;
  save(theme: Theme): Promise<void>;
}

export const THEME_STORAGE_REPOSITORY_TOKEN = new InjectionToken<ThemeStorageRepository>('ThemeStorageRepository');
