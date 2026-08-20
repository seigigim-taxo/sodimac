import { Injectable, signal } from '@angular/core';
import { Network } from '@capacitor/network';

@Injectable({ providedIn: 'root' })
export class NetworkService {
  private onlineSignal = signal(true);

  readonly isOnline = this.onlineSignal.asReadonly();

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    try {
      const status = await Network.getStatus();
      this.onlineSignal.set(status.connected);

      Network.addListener('networkStatusChange', (s) => {
        this.onlineSignal.set(s.connected);
      });
    } catch {
      this.onlineSignal.set(navigator.onLine);
      window.addEventListener('online', () => this.onlineSignal.set(true));
      window.addEventListener('offline', () => this.onlineSignal.set(false));
    }
  }
}
