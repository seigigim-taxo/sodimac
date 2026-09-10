import { ErrorHandler, Injectable, inject, NgZone } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular/standalone';
import { ErrorReportService } from './error-report.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly reportService = inject(ErrorReportService);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);
  private readonly zone = inject(NgZone);

  handleError(error: unknown): void {
    console.error('[GlobalErrorHandler]', error);

    const stack = error instanceof Error ? error.stack : String(error);

    this.zone.run(async () => {
      const metadata = await this.reportService.gatherMetadata();

      let screenshotPath = '';
      try {
        screenshotPath = await this.reportService.captureScreenshot();
      } catch {
        // Si falla la captura, se envía sin screenshot
      }

      const report = {
        ...metadata,
        descripcion: `[Auto] ${error instanceof Error ? error.message : String(error)}`,
        screenshotPath,
        tipoReporte: 'AUTOMATICO' as const,
        errorStack: stack,
      };

      const alert = await this.alertCtrl.create({
        header: 'Error detectado',
        message: 'Ocurrió un error inesperado. ¿Quieres enviar un reporte al equipo de soporte?',
        inputs: [
          {
            name: 'descripcion',
            type: 'textarea',
            placeholder: '¿Qué estabas haciendo? (opcional)',
          },
        ],
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          {
            text: 'Enviar',
            handler: async (data) => {
              report.descripcion = data.descripcion || report.descripcion;

              await this.reportService.saveReport(report);

              const toast = await this.toastCtrl.create({
                message: navigator.onLine
                  ? 'Reporte enviado. Gracias.'
                  : 'Reporte guardado. Se enviará cuando haya conexión.',
                duration: 3000,
                position: 'bottom',
              });
              await toast.present();
            },
          },
        ],
      });
      await alert.present();
    });
  }
}
