import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonMenuButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { ViewWillEnter } from '@ionic/angular';
import { ThemeFacade } from '../../state/theme/theme.facade';
import { CountingFacade } from '../../state/counting/counting.facade';
import { CountingSession } from '../../domain/counting/models/counting-session.model';
import { getStatusBadgeClass, getStatusLabel, formatDate } from '../../shared/utils/counting-status.utils';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonMenuButton,
    IonTitle,
    IonToolbar,
  ],
})
export class HomePage implements ViewWillEnter {
  private router = inject(Router);
  private theme = inject(ThemeFacade);
  private countingFacade = inject(CountingFacade);

  isDark = this.theme.isDark;
  sessions = this.countingFacade.sessions;
  recentSessions = computed(() => this.sessions().slice(0, 2));

  store = {
    name: 'Sodimac Homecenter',
    code: 'S-123',
    address: 'Av. Siempre Viva 742',
    city: 'Santiago',
  };

  getStatusBadgeClass = getStatusBadgeClass;
  getStatusLabel = getStatusLabel;
  formatDate = formatDate;

  ionViewWillEnter(): void {
    this.countingFacade.reload();
  }

  continue(): void {
    this.router.navigate(['/events']);
  }

  openSession(session?: CountingSession): void {
    if (session) {
      if (session.status === 'in-progress') {
        this.router.navigate(['/counting', session.id]);
        return;
      }
      this.router.navigate(['/counting-detail', session.id]);
    } else {
      this.router.navigate(['/counting-list']);
    }
  }

  async toggleTheme(): Promise<void> {
    await this.theme.toggle();
  }
}
