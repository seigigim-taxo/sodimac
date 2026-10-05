import { ErrorHandler, Injectable, inject, NgZone } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { AutoReportService } from './auto-report.service';

/*
 * Errores no capturados → reporte AUTOMÁTICO, sin pedir permiso al operador.
 * Antes mostraba un alert con "¿Quieres enviar un reporte?": en la práctica
 * el operador lo cerraba y el reporte se perdía. El guardado es local
 * (SQLite) y ReportSyncService lo envía cuando hay red; el toast solo
 * informa que quedó registrado, sin exigir acción.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly autoReport = inject(AutoReportService);
  private readonly toastCtrl = inject(ToastController);
  private readonly zone = inject(NgZone);

  handleError(error: unknown): void {
    console.error('[GlobalErrorHandler]', error);

    const detalle = error instanceof Error ? error.message : String(error);

    this.zone.run(() => {
      void this.autoReport
        .reportar('Error no capturado', `[App] ${detalle}`, { error })
        .then(() => this.showToast())
        .catch((e) => console.error('[GlobalErrorHandler] no se pudo guardar el reporte:', e));
    });
  }

  private async showToast(): Promise<void> {
    try {
      const toast = await this.toastCtrl.create({
        message: 'Se registró un reporte automático del error.',
        duration: 2500,
        position: 'bottom',
      });
      await toast.present();
    } catch {
      // El toast es informativo: si no puede mostrarse, no rompe nada.
    }
  }
}
