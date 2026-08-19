import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { THEME_STORAGE_REPOSITORY_TOKEN, Theme } from '../../domain/theme/repositories/theme-storage.repository';
export type { Theme };

@Injectable({ providedIn: 'root' })
export class ThemeFacade {
  private themeStorage = inject(THEME_STORAGE_REPOSITORY_TOKEN);

  private themeSignal = signal<Theme>('light');

  readonly theme  = this.themeSignal.asReadonly();
  readonly isDark = computed(() => this.themeSignal() === 'dark');

  constructor() {
    effect(() => {
      const theme = this.themeSignal();
      document.documentElement.classList.toggle('dark', theme === 'dark');
      this.updateStatusBar(theme).catch(console.error);
    });
  }

  private async updateStatusBar(theme: Theme): Promise<void> {
    try {
      await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light });
      await StatusBar.setBackgroundColor({ color: theme === 'dark' ? '#1c1c1e' : '#ffffff' });
    } catch {
      // StatusBar no disponible en web
    }
  }

  async init(): Promise<void> {
    const stored = await this.themeStorage.load();
    if (stored) this.themeSignal.set(stored);
  }

  async toggle(): Promise<void> {
    const next: Theme = this.themeSignal() === 'light' ? 'dark' : 'light';
    await this.themeStorage.save(next);
    this.themeSignal.set(next);
  }

  async setTheme(theme: Theme): Promise<void> {
    await this.themeStorage.save(theme);
    this.themeSignal.set(theme);
  }
}
