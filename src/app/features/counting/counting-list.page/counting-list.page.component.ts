import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonMenuButton, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, arrowBackOutline } from 'ionicons/icons';
import { ViewWillEnter } from '@ionic/angular/standalone';
import { CountsListComponent } from '../../../shared/components/counts-list/counts-list.component';
import { CountingFacade } from '../../../state/counting/counting.facade';
import { CountingSession } from '../../../domain/counting/models/counting-session.model';

@Component({
  selector: 'app-counting-list.page',
  templateUrl: './counting-list.page.component.html',
  imports: [
    CountsListComponent,
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonMenuButton,
    IonTitle,
    IonToolbar,
  ],
})
export class CountingListPageComponent implements ViewWillEnter {
  private router = inject(Router);
  private countingFacade = inject(CountingFacade);

  sessions = this.countingFacade.sessions;
  isLoading = this.countingFacade.isLoading;

  constructor() {
    addIcons({ arrowBackOutline, addOutline });
  }

  ionViewWillEnter(): void {
    this.countingFacade.reload();
  }

  goBack(): void {
    this.router.navigate(['/home']);
  }

  newCount(): void {
    this.router.navigate(['/zone-select']);
  }

  openSession(session: CountingSession): void {
    if (session.status === 'in-progress') {
      this.router.navigate(['/counting', session.id]);
    } else {
      this.router.navigate(['/counting-detail', session.id]);
    }
  }

  async syncSession(session: CountingSession): Promise<void> {
    try {
      await this.countingFacade.sync(session.id);
    } finally {
      this.countingFacade.reload();
    }
  }

  async deleteSession(session: CountingSession): Promise<void> {
    try {
      await this.countingFacade.remove(session.id);
    } finally {
      this.countingFacade.reload();
    }
  }
}
