<<<<<<< HEAD
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
=======
import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { THEME_STORAGE_REPOSITORY_TOKEN, Theme } from '../../domain/theme/repositories/theme-storage.repository';
export type { Theme };

@Injectable({ providedIn: 'root' })
export class ThemeFacade {
  private themeStorage = inject(THEME_STORAGE_REPOSITORY_TOKEN);

  private themeSignal = signal<Theme>('light');

  readonly theme  = this.themeSignal.asReadonly();
>>>>>>> feat/modo-analista-maqueta
  readonly isDark = computed(() => this.themeSignal() === 'dark');

  constructor() {
    effect(() => {
      const theme = this.themeSignal();
      document.documentElement.classList.toggle('dark', theme === 'dark');
      this.updateStatusBar(theme).catch(console.error);
    });
  }

  private async updateStatusBar(theme: Theme): Promise<void> {
<<<<<<< HEAD
    await this.statusBarService.setStyle(theme);
  }

  async init(): Promise<void> {
    const stored = await this.preferencesService.get(THEME_KEY);
    if (stored === 'dark' || stored === 'light') {
      this.themeSignal.set(stored);
    }
=======
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
>>>>>>> feat/modo-analista-maqueta
  }

  async toggle(): Promise<void> {
    const next: Theme = this.themeSignal() === 'light' ? 'dark' : 'light';
<<<<<<< HEAD
    await this.preferencesService.set(THEME_KEY, next);
=======
    await this.themeStorage.save(next);
>>>>>>> feat/modo-analista-maqueta
    this.themeSignal.set(next);
  }

  async setTheme(theme: Theme): Promise<void> {
<<<<<<< HEAD
    await this.preferencesService.set(THEME_KEY, theme);
=======
    await this.themeStorage.save(theme);
>>>>>>> feat/modo-analista-maqueta
    this.themeSignal.set(theme);
  }
}
