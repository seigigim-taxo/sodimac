import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Screenshot } from '@capawesome/capacitor-screenshot';
import { Device } from '@capacitor/device';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { AuthFacade } from '../../state/auth/auth.facade';
import { SucursalFacade } from '../../state/sucursal/sucursal.facade';
import { ApiService } from '../http/api.service';
import { NetworkService } from '../../shared/services/network.service';
import { SqliteConnectionService } from '../database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../database/sodimac.schema';
import { APP_VERSION } from '../version';
import { ErrorReport, ErrorReportRecord } from '../../domain/error-report/models/error-report.model';

@Injectable({ providedIn: 'root' })
export class ErrorReportService {
  private readonly authFacade = inject(AuthFacade);
  private readonly sucursalFacade = inject(SucursalFacade);
  private readonly api = inject(ApiService);
  private readonly network = inject(NetworkService);
  private readonly sqlite = inject(SqliteConnectionService);
  private readonly router = inject(Router);

  private static readonly SCREENSHOT_DIR = 'error_reports';

  async captureScreenshot(): Promise<string> {
    const result = await Screenshot.take();
    const tempUri = result.uri;

    const filename = `error_report_${Date.now()}.jpg`;
    const fileContent = await Filesystem.readFile({ path: tempUri });

    await Filesystem.writeFile({
      path: `${ErrorReportService.SCREENSHOT_DIR}/${filename}`,
      data: fileContent.data,
      directory: Directory.Data,
    });

    return filename;
  }

  async gatherMetadata(): Promise<Omit<ErrorReport, 'descripcion' | 'screenshotPath' | 'tipoReporte' | 'errorStack'>> {
    const session = this.authFacade.session();
    const store = this.sucursalFacade.currentStore();
    const deviceInfo = await Device.getInfo();

    return {
      rut: session?.rutNormalizado ?? '',
      nombreCompleto: session?.nombreCompleto,
      correo: session?.correo ?? '',
      tipoUsuario: session?.tipoUsuario ?? '',
      versionApp: APP_VERSION,
      fechaHora: new Date().toISOString(),
      codigoTienda: store?.codigoTienda ?? '',
      nombreTienda: store?.nombre ?? '',
      dispositivo: `${deviceInfo.manufacturer ?? ''} ${deviceInfo.model ?? ''}`.trim(),
      plataforma: deviceInfo.platform,
      sistemaOperativo: deviceInfo.osVersion ?? '',
      pantallaActual: this.router.url,
    };
  }

  async saveReport(report: ErrorReport): Promise<void> {
    const db = await this.sqlite.getConnection(SODIMAC_DB_NAME);

    await db.run(`
      INSERT INTO sod_error_report
      (rut, nombre_completo, correo, tipo_usuario, version_app, fecha_hora,
       codigo_tienda, nombre_tienda, dispositivo, plataforma, sistema_operativo,
       descripcion, screenshot_path, tipo_reporte, pantalla_actual, error_stack,
       enviado, intentos, estado, fecha_creacion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'PENDIENTE', datetime('now'))
    `, [
      report.rut, report.nombreCompleto ?? '', report.correo, report.tipoUsuario,
      report.versionApp, report.fechaHora, report.codigoTienda, report.nombreTienda,
      report.dispositivo, report.plataforma, report.sistemaOperativo,
      report.descripcion, report.screenshotPath, report.tipoReporte,
      report.pantallaActual, report.errorStack ?? '',
    ]);
  }

  async getPendingReports(): Promise<ErrorReportRecord[]> {
    const db = await this.sqlite.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT * FROM sod_error_report WHERE estado != 'ENVIADO' ORDER BY fecha_creacion DESC`
    );
    return result.values as ErrorReportRecord[];
  }

  async getAllReports(): Promise<ErrorReportRecord[]> {
    const db = await this.sqlite.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT * FROM sod_error_report ORDER BY fecha_creacion DESC`
    );
    return result.values as ErrorReportRecord[];
  }

  async sendReport(record: ErrorReportRecord): Promise<void> {
    let screenshotBase64 = '';
    if (record.screenshotPath) {
      try {
        const file = await Filesystem.readFile({
          path: `${ErrorReportService.SCREENSHOT_DIR}/${record.screenshotPath}`,
          directory: Directory.Data,
        });
        screenshotBase64 = typeof file.data === 'string' ? file.data : '';
      } catch {
        // Si no se puede leer el archivo, se envía sin screenshot
      }
    }

    const payload = {
      rut: record.rut,
      nombreCompleto: record.nombreCompleto,
      correo: record.correo,
      tipoUsuario: record.tipoUsuario,
      versionApp: record.versionApp,
      fechaHora: record.fechaHora,
      codigoTienda: record.codigoTienda,
      nombreTienda: record.nombreTienda,
      dispositivo: record.dispositivo,
      plataforma: record.plataforma,
      sistemaOperativo: record.sistemaOperativo,
      descripcion: record.descripcion,
      screenshot: screenshotBase64,
      tipoReporte: record.tipoReporte,
      pantallaActual: record.pantallaActual,
      errorStack: record.errorStack,
    };

    await this.api.post('reportes/error.php', payload);
  }

  async markAsSent(id: number): Promise<void> {
    const db = await this.sqlite.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `UPDATE sod_error_report SET estado = 'ENVIADO', enviado = 1 WHERE id = ?`,
      [id]
    );
  }

  async markAsError(id: number): Promise<void> {
    const db = await this.sqlite.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `UPDATE sod_error_report SET intentos = intentos + 1,
       estado = CASE WHEN intentos + 1 >= 3 THEN 'ERROR' ELSE 'PENDIENTE' END
       WHERE id = ?`,
      [id]
    );
  }

  async resetRetries(id: number): Promise<void> {
    const db = await this.sqlite.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `UPDATE sod_error_report SET intentos = 0, estado = 'PENDIENTE' WHERE id = ?`,
      [id]
    );
  }

  async deleteScreenshot(filename: string): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path: `${ErrorReportService.SCREENSHOT_DIR}/${filename}`,
        directory: Directory.Data,
      });
    } catch {
      // Si no existe, no hay problema
    }
  }

  async cleanupSentReports(): Promise<void> {
    const db = await this.sqlite.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT screenshot_path FROM sod_error_report
       WHERE estado = 'ENVIADO' AND fecha_creacion < datetime('now', '-7 days')`
    );

    for (const row of (result.values || [])) {
      if (row.screenshot_path) {
        await this.deleteScreenshot(row.screenshot_path);
      }
    }

    await db.run(
      `DELETE FROM sod_error_report WHERE estado = 'ENVIADO' AND fecha_creacion < datetime('now', '-7 days')`
    );
  }
}
