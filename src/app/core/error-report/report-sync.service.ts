import { Injectable, inject, NgZone } from '@angular/core';
import { Network } from '@capacitor/network';
import { ErrorReportService } from './error-report.service';
import { SqliteConnectionService } from '../database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../database/sodimac.schema';
import { ToastController } from '@ionic/angular/standalone';

@Injectable({ providedIn: 'root' })
export class ReportSyncService {
  private readonly reportService = inject(ErrorReportService);
  private readonly sqlite = inject(SqliteConnectionService);
  private readonly toastCtrl = inject(ToastController);
  private readonly zone = inject(NgZone);
  private syncing = false;
  private pendingToastShown = false;

  init(): void {
    this.reportService.fixStuckRetries();
    this.retryPending();

    Network.addListener('networkStatusChange', (status) => {
      if (status.connected) {
        this.zone.run(() => this.retryPending());
      }
    });
  }

  async retryPending(): Promise<void> {
    if (this.syncing || !navigator.onLine) return;
    this.syncing = true;

    try {
      const pending = await this.reportService.getPendingReports();

      for (const report of pending) {
        try {
          await this.reportService.sendReport(report);
          await this.reportService.markAsSent(report.id!);
          await this.reportService.deleteScreenshot(report.screenshotPath);
        } catch {
          await this.reportService.markAsError(report.id!);
        }
      }

      await this.reportService.cleanupSentReports();

      const remaining = await this.reportService.getPendingReports();
      if (pending.length > 0 && remaining.length === 0) {
        this.pendingToastShown = false;
        this.showToast('Reportes enviados correctamente');
      } else if (remaining.length > 0 && !this.pendingToastShown) {
        this.pendingToastShown = true;
        this.showToast(`${remaining.length} reporte(s) pendiente(s)`);
      }
    } finally {
      this.syncing = false;
    }
  }

  async retryOne(id: number): Promise<void> {
    const db = await this.sqlite.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(`SELECT * FROM sod_error_report WHERE id = ?`, [id]);
    const report = result.values?.[0];
    if (!report) return;

    try {
      await this.reportService.resetRetries(id);
      await this.reportService.sendReport(report);
      await this.reportService.markAsSent(id);
      await this.reportService.deleteScreenshot(report.screenshot_path);
      this.showToast('Reporte enviado');
    } catch {
      await this.reportService.markAsError(id);
      this.showToast('Error al enviar. Reintentá más tarde.');
    }
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'top',
    });
    await toast.present();
  }
}
