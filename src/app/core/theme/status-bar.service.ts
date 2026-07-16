import { Injectable } from '@angular/core';
import { StatusBar, Style } from '@capacitor/status-bar';

export type ThemeStyle = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class StatusBarService {
  async setStyle(style: ThemeStyle): Promise<void> {
    try {
      await StatusBar.setStyle({
        style: style === 'dark' ? Style.Dark : Style.Light,
      });
      await StatusBar.setBackgroundColor({
        color: style === 'dark' ? '#1c1c1e' : '#ffffff',
      });
    } catch {
      // StatusBar not available (browser)
    }
  }
}
