import { Injectable, inject, signal, effect } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { StatusBar, Style } from '@capacitor/status-bar';

const THEME_KEY = 'theme';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeFacade {
  private themeSignal = signal<Theme>('light');

  readonly theme = this.themeSignal.asReadonly();
  readonly isDark = () => this.themeSignal() === 'dark';

  constructor() {
    effect(() => {
      const theme = this.themeSignal();
      document.documentElement.classList.toggle('dark', theme === 'dark');
      this.updateStatusBar(theme);
    });
  }

  private async updateStatusBar(theme: Theme): Promise<void> {
    try {
      await StatusBar.setStyle({
        style: theme === 'dark' ? Style.Dark : Style.Light,
      });
      await StatusBar.setBackgroundColor({
        color: theme === 'dark' ? '#1c1c1e' : '#ffffff',
      });
    } catch {
      // StatusBar not available (browser)
    }
  }

  async init(): Promise<void> {
    const stored = await Preferences.get({ key: THEME_KEY });
    if (stored.value === 'dark' || stored.value === 'light') {
      this.themeSignal.set(stored.value);
    }
  }

  async toggle(): Promise<void> {
    const next: Theme = this.themeSignal() === 'light' ? 'dark' : 'light';
    await Preferences.set({ key: THEME_KEY, value: next });
    this.themeSignal.set(next);
  }

  async setTheme(theme: Theme): Promise<void> {
    await Preferences.set({ key: THEME_KEY, value: theme });
    this.themeSignal.set(theme);
  }
}
