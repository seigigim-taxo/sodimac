import { Injectable, inject, signal, effect, computed } from '@angular/core';
import { PreferencesService } from '../../core/storage/preferences.service';
import { StatusBarService } from '../../core/theme/status-bar.service';

const THEME_KEY = 'theme';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeFacade {
  private preferencesService = inject(PreferencesService);
  private statusBarService = inject(StatusBarService);

  private themeSignal = signal<Theme>('light');

  readonly theme = this.themeSignal.asReadonly();
  readonly isDark = computed(() => this.themeSignal() === 'dark');

  constructor() {
    effect(() => {
      const theme = this.themeSignal();
      document.documentElement.classList.toggle('dark', theme === 'dark');
      this.updateStatusBar(theme);
    });
  }

  private async updateStatusBar(theme: Theme): Promise<void> {
    await this.statusBarService.setStyle(theme);
  }

  async init(): Promise<void> {
    const stored = await this.preferencesService.get(THEME_KEY);
    if (stored === 'dark' || stored === 'light') {
      this.themeSignal.set(stored);
    }
  }

  async toggle(): Promise<void> {
    const next: Theme = this.themeSignal() === 'light' ? 'dark' : 'light';
    await this.preferencesService.set(THEME_KEY, next);
    this.themeSignal.set(next);
  }

  async setTheme(theme: Theme): Promise<void> {
    await this.preferencesService.set(THEME_KEY, theme);
    this.themeSignal.set(theme);
  }
}
