import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonFab, IonFabButton, IonIcon, ModalController } from '@ionic/angular/standalone';
import { AuthFacade } from '../../../state/auth/auth.facade';
import { Router } from '@angular/router';
import { ErrorReportDialogComponent } from '../error-report-dialog/error-report-dialog.component';

@Component({
  selector: 'app-error-report-fab',
  standalone: true,
  imports: [CommonModule, IonFab, IonFabButton, IonIcon],
  template: `
    <ion-fab vertical="bottom" horizontal="end" slot="fixed" *ngIf="visible()" class="fab-safe-area">
      <ion-fab-button (click)="openDialog()" color="danger" size="small">
        <ion-icon name="bug-outline"></ion-icon>
      </ion-fab-button>
    </ion-fab>
  `,
  styles: `
    .fab-safe-area {
      padding-bottom: env(safe-area-inset-bottom, 0px);
      z-index: 9999;
    }
  `,
})
export class ErrorReportFabComponent {
  private readonly modalCtrl = inject(ModalController);
  private readonly authFacade = inject(AuthFacade);
  private readonly router = inject(Router);

  visible = computed(() => {
    const isAuthenticated = this.authFacade.isAuthenticated();
    const currentUrl = this.router.url;
    return isAuthenticated && currentUrl !== '/login';
  });

  async openDialog() {
    const modal = await this.modalCtrl.create({
      component: ErrorReportDialogComponent,
    });
    await modal.present();
  }
}
