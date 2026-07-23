import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { ThemeStorageRepository, Theme } from '../../domain/theme/repositories/theme-storage.repository';
import { THEME_KEY } from '../../domain/theme/constants/theme.constants';

@Injectable({ providedIn: 'root' })
export class CapacitorThemeStorageRepository implements ThemeStorageRepository {
  async load(): Promise<Theme | null> {
    const stored = await Preferences.get({ key: THEME_KEY });
    if (stored.value === 'dark' || stored.value === 'light') return stored.value;
    return null;
  }

  async save(theme: Theme): Promise<void> {
    await Preferences.set({ key: THEME_KEY, value: theme });
  }
}
