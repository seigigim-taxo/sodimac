import { Injectable, inject } from '@angular/core';
import { AlertController } from '@ionic/angular/standalone';
import { NetworkService } from './network.service';

/*
 * El aviso de que un TAG no llegó al servidor.
 *
 * POR QUÉ ES UN DIÁLOGO Y NO UNA TOAST
 *
 * Hasta ahora el fallo se avisaba con una toast de 3 segundos que se iba sola.
 * En terreno eso equivale a no avisar: el operador finaliza el TAG, la app
 * navega a la pantalla siguiente, la toast pasa mientras él ya está mirando
 * otra cosa, y sigue trabajando convencido de que subió. Pasó con el TAG 6000.
 *
 * Acá el diálogo no se cierra solo, no se cierra tocando afuera y no tiene
 * salida que no sea "Aceptar". La promesa recién resuelve cuando el operador lo
 * reconoce, así que quien llama puede esperar antes de navegar.
 *
 * El éxito, en cambio, sigue siendo toast. Si obligáramos a aceptar también las
 * buenas noticias, el operador aprendería a tocar Aceptar sin leer y el aviso
 * dejaría de servir justo cuando importa.
 *
 * Los saltos de línea viajan como \n y los respeta .aviso-sincronizacion en
 * global.scss, por el mismo motivo que la alerta del respaldo: Ionic no permite
 * HTML en las alertas.
 */

/*
 * La última línea del diálogo es para soporte: es lo que el operador le lee por
 * teléfono a quien lo esté ayudando. "Sin conexión" y "el servidor no
 * respondió" son dos llamadas muy distintas, y el operador no puede
 * distinguirlas mirando la pantalla.
 */
const SIN_CONEXION = 'La PDA está sin conexión.';

@Injectable({ providedIn: 'root' })
export class AvisoSincronizacionService {
  private alertController = inject(AlertController);
  private network = inject(NetworkService);

  /** Un TAG que no se pudo enviar. Resuelve al tocar Aceptar. */
  async avisarFalloTag(tag: string | null, error?: string | null): Promise<void> {
    const cual = tag ? `El TAG ${tag}` : 'El TAG';

    await this.presentar(
      `${cual} no se envió al servidor`,
      [
        'El conteo está guardado en la PDA — no se perdió nada.',
        'Queda pendiente. Reintenta desde el resumen de TAGs cuando tengas señal.',
      ],
      error,
    );
  }

  /*
   * El envío masivo no puede encadenar un diálogo por TAG fallido: con cinco
   * pendientes el operador tocaría Aceptar cinco veces y no leería ninguno. Va
   * uno solo, pero con los códigos, que es lo que necesita para saber cuáles
   * reintentar.
   */
  async avisarFalloLote(tagsFallidos: readonly (string | null)[], total: number): Promise<void> {
    const fallidos = tagsFallidos.length;
    if (fallidos === 0) return;

    const codigos = tagsFallidos.filter((t): t is string => !!t);

    await this.presentar(
      `${fallidos} de ${total} TAGs no se enviaron`,
      [
        codigos.length > 0 ? `TAGs: ${codigos.join(', ')}.` : '',
        'Los conteos están guardados en la PDA — no se perdió nada.',
        'Quedan pendientes. Reintenta cuando tengas señal.',
      ],
      null,
    );
  }

  private async presentar(header: string, lineas: string[], error?: string | null): Promise<void> {
    /*
     * Estando sin conexión, el mensaje técnico del Error ("Failed to fetch") no
     * le dice nada a nadie; que la PDA no tiene señal, sí. Con conexión se
     * muestra el error tal cual, que es la única pista que le queda a soporte.
     */
    const detalle = this.network.isOnline() ? (error?.trim() || null) : SIN_CONEXION;

    const cuerpo = [
      ...lineas.filter((l) => l !== ''),
      ...(detalle ? [`Detalle: ${detalle}`] : []),
    ];

    const alert = await this.alertController.create({
      header,
      message: cuerpo.join('\n\n'),
      // Sin salidas laterales: la única forma de cerrar es reconocer el fallo.
      backdropDismiss: false,
      buttons: [{ text: 'Aceptar', role: 'confirm' }],
      cssClass: 'aviso-sincronizacion',
    });

    await alert.present();
    // Recién acá se considera avisado. Quien llama espera esto antes de navegar.
    await alert.onDidDismiss();
  }
}
