import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
  IonContent, IonText, IonSpinner, IonItem, IonLabel,
  IonTextarea, IonFooter, ModalController, ToastController
} from '@ionic/angular/standalone';
import { ErrorReportService } from '../../../core/error-report/error-report.service';
import { Filesystem, Directory } from '@capacitor/filesystem';

@Component({
  selector: 'app-error-report-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonText, IonSpinner, IonItem, IonLabel,
    IonTextarea, IonFooter,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Reportar error</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Cancelar</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="screenshot-preview" *ngIf="screenshotPreview">
        <img [src]="screenshotPreview" alt="Captura de pantalla" />
      </div>

      <ion-text color="medium" class="ion-text-center" *ngIf="loading">
        <ion-spinner name="crescent"></ion-spinner>
        <p>Capturando pantalla...</p>
      </ion-text>

      <ion-item>
        <ion-label position="floating">Describe qué pasó *</ion-label>
        <ion-textarea
          [(ngModel)]="descripcion"
          rows="4"
          placeholder="¿Qué estabas haciendo? ¿Qué error viste?"
        ></ion-textarea>
      </ion-item>
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Cancelar</ion-button>
          <ion-button
            expand="block"
            color="primary"
            [disabled]="!descripcion.trim() || sending"
            (click)="send()"
          >
            <ion-spinner name="crescent" *ngIf="sending"></ion-spinner>
            {{ sending ? 'Enviando...' : 'Enviar reporte' }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  `,
})
export class ErrorReportDialogComponent implements OnInit {
  private readonly modalCtrl = inject(ModalController);
  private readonly reportService = inject(ErrorReportService);
  private readonly toastCtrl = inject(ToastController);

  screenshotFilename = '';
  screenshotPreview = '';
  descripcion = '';
  loading = true;
  sending = false;

  async ngOnInit() {
    try {
      this.screenshotFilename = await this.reportService.captureScreenshot();

      const file = await Filesystem.readFile({
        path: `error_reports/${this.screenshotFilename}`,
        directory: Directory.Data,
      });
      this.screenshotPreview = `data:image/jpeg;base64,${file.data}`;
    } catch {
      // Si falla, se envía sin captura
    }
    this.loading = false;
  }

  async send() {
    this.sending = true;
    const metadata = await this.reportService.gatherMetadata();

    const report = {
      ...metadata,
      descripcion: this.descripcion,
      screenshotPath: this.screenshotFilename,
      tipoReporte: 'MANUAL' as const,
    };

    await this.reportService.saveReport(report);

    const toast = await this.toastCtrl.create({
      message: navigator.onLine
        ? 'Reporte enviado. Gracias.'
        : 'Reporte guardado. Se enviará cuando haya conexión.',
      duration: 3000,
      position: 'bottom',
    });
    await toast.present();

    this.dismiss({ sent: true });
  }

  dismiss(result?: { sent: boolean }) {
    this.modalCtrl.dismiss(result);
  }
}
