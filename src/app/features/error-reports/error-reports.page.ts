import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle,
  IonContent, IonRefresher, IonRefresherContent, IonText, IonList,
  IonItemSliding, IonItem, IonIcon, IonLabel, IonBadge,
  IonItemOptions, IonItemOption
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircle, alertCircle, timeOutline, camera, refresh, trash } from 'ionicons/icons';
import { ErrorReportService } from '../../core/error-report/error-report.service';
import { ReportSyncService } from '../../core/error-report/report-sync.service';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { ErrorReportRecord } from '../../domain/error-report/models/error-report.model';

@Component({
  selector: 'app-error-reports',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle,
    IonContent, IonRefresher, IonRefresherContent, IonText, IonList,
    IonItemSliding, IonItem, IonIcon, IonLabel, IonBadge,
    IonItemOptions, IonItemOption,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/home"></ion-back-button>
        </ion-buttons>
        <ion-title>Mis reportes</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <ion-text color="medium" *ngIf="reports.length === 0" class="ion-text-center">
        <p>No hay reportes registrados.</p>
      </ion-text>

      <ion-list>
        <ion-item-sliding *ngFor="let report of reports">
          <ion-item>
            <ion-icon
              [name]="report.estado === 'ENVIADO' ? 'checkmark-circle' : report.estado === 'ERROR' ? 'alert-circle' : 'time-outline'"
              [color]="report.estado === 'ENVIADO' ? 'success' : report.estado === 'ERROR' ? 'danger' : 'warning'"
              slot="start"
            ></ion-icon>
            <ion-label>
              <h2>{{ report.descripcion | slice:0:60 }}{{ report.descripcion.length > 60 ? '...' : '' }}</h2>
              <p>{{ formatDate(report.fechaCreacion) }}</p>
              <p>{{ report.pantallaActual }}</p>
              <p>
                <ion-badge [color]="report.estado === 'ENVIADO' ? 'success' : report.estado === 'ERROR' ? 'danger' : 'warning'">
                  {{ report.estado }}
                </ion-badge>
                <ion-icon name="camera" color="medium" *ngIf="report.screenshotPath" style="margin-left: 8px; font-size: 14px;"></ion-icon>
                <span *ngIf="report.intentos > 0"> · Intentos: {{ report.intentos > 3 ? 3 : report.intentos }}/3</span>
              </p>
            </ion-label>
          </ion-item>

          <ion-item-options side="end">
            <ion-item-option
              color="primary"
              *ngIf="report.estado !== 'ENVIADO'"
              (click)="retry(report)"
            >
              <ion-icon name="refresh" slot="icon-only"></ion-icon>
            </ion-item-option>
            <ion-item-option
              color="danger"
              (click)="deleteReport(report)"
            >
              <ion-icon name="trash" slot="icon-only"></ion-icon>
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
      </ion-list>
    </ion-content>
  `,
})
export class ErrorReportsPage implements OnInit {
  private readonly reportService = inject(ErrorReportService);
  private readonly syncService = inject(ReportSyncService);
  private readonly sqlite = inject(SqliteConnectionService);

  reports: ErrorReportRecord[] = [];

  constructor() {
    addIcons({ checkmarkCircle, alertCircle, timeOutline, camera, refresh, trash });
  }

  async ngOnInit() {
    await this.loadReports();
  }

  async loadReports() {
    this.reports = await this.reportService.getAllReports();
  }

  async refresh(event: any) {
    await this.loadReports();
    event.target.complete();
  }

  async retry(report: ErrorReportRecord) {
    await this.syncService.retryOne(report.id!);
    await this.loadReports();
  }

  async deleteReport(report: ErrorReportRecord) {
    await this.reportService.deleteScreenshot(report.screenshotPath);
    const db = await this.sqlite.getConnection(SODIMAC_DB_NAME);
    await db.run(`DELETE FROM sod_error_report WHERE id = ?`, [report.id]);
    await this.loadReports();
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const day = String(d.getDate()).padStart(2, '0');
    return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
  }
}
