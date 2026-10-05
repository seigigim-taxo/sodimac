import { Injectable, inject, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { Screenshot } from '@capawesome/capacitor-screenshot';
import { Device } from '@capacitor/device';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { AuthFacade } from '../../state/auth/auth.facade';
import { SucursalFacade } from '../../state/sucursal/sucursal.facade';
import { SqliteConnectionService } from '../database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../database/sodimac.schema';
import { APP_VERSION } from '../version';
import { ErrorReport } from '../../domain/error-report/models/error-report.model';

/*
 * Ventana mínima entre dos reportes automáticos con la MISMA descripción.
 *
 * Sin esto, un fallo en cadena —un endpoint que responde 500 cada vez que un
 * servicio de fondo reintenta— genera cientos de filas idénticas y se come el
 * almacenamiento del equipo más el cupo del endpoint. El dedupe corta la
 * inundación sin perder la señal: si el problema persiste, cada ventana deja
 * un reporte.
 */
const VENTANA_DEDUP_MINUTOS = 10;

/**
 * Punto único para generar reportes de error AUTOMÁTICOS (sin intervención
 * del operador). No depende de ApiService —ApiService depende de este servicio—
 * así que no hay ciclo: acá solo se GUARDA en SQLite; el envío lo hace
 * ReportSyncService en segundo plano.
 *
 * Las facades NO se inyectan en el constructor: AuthFacade cuelga de
 * LoginUseCase → AuthService → ApiService, y ApiService inyecta este servicio.
 * Inyectarlas acá cerraría el ciclo (AuthFacade → ... → ApiService →
 * AutoReportService → AuthFacade) en tiempo de construcción. Se resuelven
 * perezosamente desde el Injector, cuando reportar() corre en runtime.
 *
 * Para controlar un caso nuevo, llamar a reportar(contexto, detalle) desde
 * donde se detecta la falla. El resto (metadatos, captura, cola, reintentos)
 * es común.
 */
@Injectable({ providedIn: 'root' })
export class AutoReportService {
  private readonly injector = inject(Injector);
  private readonly sqlite = inject(SqliteConnectionService);
  private readonly router = inject(Router);

  static readonly SCREENSHOT_DIR = 'error_reports';

  async reportar(
    contexto: string,
    detalle: string,
    opts?: { error?: unknown }
  ): Promise<void> {
    try {
      const descripcion = `[Auto][${contexto}] ${detalle}`;

      if (await this.duplicadoReciente(descripcion)) {
        console.warn('[auto-report] duplicado reciente, se omite:', contexto);
        return;
      }

      const metadata = await this.gatherMetadata();

      let screenshotPath = '';
      try {
        screenshotPath = await this.captureScreenshot();
      } catch {
        // Sin captura el reporte igual sirve: el detalle está en la descripción.
      }

      await this.saveReport({
        ...metadata,
        descripcion,
        screenshotPath,
        tipoReporte: 'AUTOMATICO',
        errorStack: this.stackDe(opts?.error),
      });
    } catch (e) {
      /*
       * reportar() NUNCA puede romper el flujo que lo llamó: se invoca desde
       * ApiService en pleno manejo de error y desde el ErrorHandler global.
       */
      console.error('[auto-report] no se pudo guardar:', e);
    }
  }

  async captureScreenshot(): Promise<string> {
    const result = await Screenshot.take();
    const tempUri = result.uri;

    const filename = `error_report_${Date.now()}.jpg`;
    const fileContent = await Filesystem.readFile({ path: tempUri });

    try {
      await Filesystem.mkdir({
        path: AutoReportService.SCREENSHOT_DIR,
        directory: Directory.Data,
        recursive: true,
      });
    } catch {
      // Directorio ya existe, continuar
    }

    await Filesystem.writeFile({
      path: `${AutoReportService.SCREENSHOT_DIR}/${filename}`,
      data: fileContent.data,
      directory: Directory.Data,
    });

    return filename;
  }

  async gatherMetadata(): Promise<
    Omit<ErrorReport, 'descripcion' | 'screenshotPath' | 'tipoReporte' | 'errorStack'>
  > {
    // Resolución perezosa (ver comentario de la clase): fuera del ciclo de DI.
    const session = this.injector.get(AuthFacade).session();
    const store = this.injector.get(SucursalFacade).currentStore();
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

  private async duplicadoReciente(descripcion: string): Promise<boolean> {
    try {
      const db = await this.sqlite.getConnection(SODIMAC_DB_NAME);
      const result = await db.query(
        `SELECT 1 FROM sod_error_report
         WHERE descripcion = ?
           AND fecha_creacion > datetime('now', ?)
         LIMIT 1`,
        [descripcion, `-${VENTANA_DEDUP_MINUTOS} minutes`]
      );
      return (result.values?.length ?? 0) > 0;
    } catch {
      // Si la consulta falla, mejor reportar de más que perder el reporte.
      return false;
    }
  }

  private stackDe(error: unknown): string {
    if (error instanceof Error) return error.stack ?? error.message;
    if (error === undefined || error === null) return '';
    return String(error);
  }
}
