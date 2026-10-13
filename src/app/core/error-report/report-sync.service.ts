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
      const r = await this.procesarPendientes();

      if (r.pendientes > 0 && r.restantes === 0) {
        this.pendingToastShown = false;
        this.showToast('Reportes enviados correctamente');
      } else if (r.restantes > 0 && !this.pendingToastShown) {
        this.pendingToastShown = true;
        this.showToast(`${r.restantes} reporte(s) pendiente(s)`);
      }
    } finally {
      this.syncing = false;
    }
  }

  /*
   * Reenvío explícito desde "Enviar pendientes" del menú: además de los
   * PENDIENTE, resetea los que agotaron reintentos (estado ERROR →
   * PENDIENTE, intentos 0) — si no, quedan pegados para siempre: el retry
   * automático solo mira PENDIENTE. No muestra toast propio; el llamador
   * arma el suyo con el resultado.
   */
  async retryAll(): Promise<{ enviados: number; conError: number }> {
    if (this.syncing || !navigator.onLine) return { enviados: 0, conError: 0 };
    this.syncing = true;

    try {
      const db = await this.sqlite.getConnection(SODIMAC_DB_NAME);
      await db.run(`UPDATE sod_error_report SET estado = 'PENDIENTE', intentos = 0 WHERE estado = 'ERROR'`);

      const r = await this.procesarPendientes();
      return { enviados: r.enviados, conError: r.conError };
    } finally {
      this.syncing = false;
    }
  }

  private async procesarPendientes(): Promise<{ enviados: number; conError: number; pendientes: number; restantes: number }> {
    const pending = await this.reportService.getPendingReports();
    let enviados = 0;
    let conError = 0;

    for (const report of pending) {
      try {
        await this.reportService.sendReport(report);
        await this.reportService.markAsSent(report.id!);
        await this.reportService.deleteScreenshot(report.screenshotPath);
        enviados++;
      } catch {
        await this.reportService.markAsError(report.id!);
        conError++;
      }
    }

    await this.reportService.cleanupSentReports();

    const restantes = (await this.reportService.getPendingReports()).length;
    return { enviados, conError, pendientes: pending.length, restantes };
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
