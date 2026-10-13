import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { ApiService } from '../http/api.service';
import { SqliteConnectionService } from '../database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../database/sodimac.schema';
import { ErrorReport, ErrorReportRecord } from '../../domain/error-report/models/error-report.model';
import { AutoReportService } from './auto-report.service';

/*
 * PNG de 1x1. error.php exige screenshotBase64 no vacío; en web, cuando la
 * captura falla, se manda esto para que el reporte igual entre. En el APK
 * este camino no se usa (hay cola SQLite y captura nativa).
 */
const PNG_PLACEHOLDER = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

@Injectable({ providedIn: 'root' })
export class ErrorReportService {
  private readonly api = inject(ApiService);
  private readonly sqlite = inject(SqliteConnectionService);
  private readonly auto = inject(AutoReportService);

  /*
   * Captura/metadata/guardado viven en AutoReportService (que NO depende de
   * ApiService; si estuvieran acá, ApiService → ErrorReportService → ApiService
   * sería un ciclo de inyección). Acá se delegan para no romper a los
   * llamadores existentes.
   */
  captureScreenshot(): Promise<string> {
    return this.auto.captureScreenshot();
  }

  gatherMetadata(): Promise<Omit<ErrorReport, 'descripcion' | 'screenshotPath' | 'tipoReporte' | 'errorStack'>> {
    return this.auto.gatherMetadata();
  }

  /*
   * En web (ng serve / pruebas contra el WS local de Laragon) no hay SQLite:
   * getConnection lanza. El reporte manual se manda DIRECTO al WS en vez de
   * perderse — en el APK (Capacitor.isNativePlatform() true) siempre va por la
   * cola SQLite con reintentos, igual que siempre.
   */
  async saveReport(report: ErrorReport): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      return this.auto.saveReport(report);
    }
    await this.api.post('reportes/error.php', await this.payloadDe(report), { sinReporte: true });
  }

  async getPendingReports(): Promise<ErrorReportRecord[]> {
    const db = await this.sqlite.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT * FROM sod_error_report WHERE estado = 'PENDIENTE' ORDER BY fecha_creacion DESC`
    );
    return (result.values || []).map(this.mapRecord) as ErrorReportRecord[];
  }

  async getAllReports(): Promise<ErrorReportRecord[]> {
    const db = await this.sqlite.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT * FROM sod_error_report ORDER BY fecha_creacion DESC`
    );
    return (result.values || []).map(this.mapRecord) as ErrorReportRecord[];
  }

  private mapRecord(row: any): ErrorReportRecord {
    return {
      id: row.id,
      rut: row.rut,
      nombreCompleto: row.nombre_completo,
      correo: row.correo,
      tipoUsuario: row.tipo_usuario,
      versionApp: row.version_app,
      fechaHora: row.fecha_hora,
      codigoTienda: row.codigo_tienda,
      nombreTienda: row.nombre_tienda,
      dispositivo: row.dispositivo,
      plataforma: row.plataforma,
      sistemaOperativo: row.sistema_operativo,
      descripcion: row.descripcion,
      screenshotPath: row.screenshot_path,
      tipoReporte: row.tipo_reporte,
      pantallaActual: row.pantalla_actual,
      errorStack: row.error_stack,
      enviado: row.enviado,
      intentos: row.intentos,
      estado: row.estado,
      fechaCreacion: row.fecha_creacion,
    };
  }

  async sendReport(record: ErrorReportRecord): Promise<void> {
    /*
     * sinReporte: un fallo al ENVIAR reportes no debe generar otro reporte —
     * entraría en bucle (reporte fallido → nuevo reporte → fallar de nuevo).
     */
    await this.api.post('reportes/error.php', await this.payloadDe(record), { sinReporte: true });
  }

  private async payloadDe(report: ErrorReport): Promise<Record<string, unknown>> {
    let screenshotBase64 = '';
    if (report.screenshotPath) {
      try {
        const file = await Filesystem.readFile({
          path: `${AutoReportService.SCREENSHOT_DIR}/${report.screenshotPath}`,
          directory: Directory.Data,
        });
        screenshotBase64 = typeof file.data === 'string' ? file.data : '';
      } catch {
        // Si no se puede leer el archivo, se envía con el placeholder
      }
    }

    return {
      rut: report.rut,
      nombreCompleto: report.nombreCompleto,
      correo: report.correo,
      tipoUsuario: report.tipoUsuario,
      versionApp: report.versionApp,
      fechaHora: report.fechaHora,
      codigoTienda: report.codigoTienda,
      nombreTienda: report.nombreTienda,
      dispositivo: report.dispositivo,
      plataforma: report.plataforma,
      sistemaOperativo: report.sistemaOperativo,
      descripcion: report.descripcion,
      screenshotBase64: screenshotBase64 || PNG_PLACEHOLDER,
      tipoReporte: report.tipoReporte,
      pantallaActual: report.pantallaActual,
      errorStack: report.errorStack,
    };
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
      `UPDATE sod_error_report
       SET intentos = MIN(intentos + 1, 3),
           estado = CASE WHEN MIN(intentos + 1, 3) >= 3 THEN 'ERROR' ELSE 'PENDIENTE' END
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
        path: `${AutoReportService.SCREENSHOT_DIR}/${filename}`,
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

  async fixStuckRetries(): Promise<void> {
    const db = await this.sqlite.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `UPDATE sod_error_report SET intentos = 3 WHERE intentos > 3 AND estado = 'ERROR'`
    );
  }
}
