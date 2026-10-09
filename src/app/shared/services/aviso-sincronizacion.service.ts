import { Injectable, inject } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular/standalone';
import { NetworkService } from './network.service';
import { MotivoFalloEnvio } from '../../domain/sincronizacion/models/motivo-fallo-envio.model';

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
  private toastController = inject(ToastController);

  /*
   * Un TAG que no quedó confirmado. Resuelve al tocar Aceptar.
   *
   * El texto depende de qué se sabe, porque piden reacciones opuestas:
   *   - NO_ENVIADO: el servidor no lo tiene; se reenvía solo.
   *   - EN_DUDA:    pudo haberlo recibido; que NO lo vuelva a contar.
   *   - YA_SE_ENVIA: no es un fallo, otro envío del mismo TAG está en marcha;
   *                  va como toast y no obliga a aceptar nada.
   */
  async avisarFalloTag(
    tag: string | null, error?: string | null, motivo: MotivoFalloEnvio = 'NO_ENVIADO',
  ): Promise<void> {
    if (motivo === 'YA_SE_ENVIA') {
      await this.avisarYaSeEnvia();
      return;
    }

    if (motivo === 'EN_DUDA') {
      await this.presentar(
        `No pudimos confirmar ${tag ? `el TAG ${tag}` : 'el TAG'}`,
        [
          'El conteo está guardado en la PDA — no se perdió nada.',
          'Es posible que el servidor ya lo tenga. No lo vuelvas a contar: la PDA lo verificará sola cuando haya señal.',
        ],
        error,
      );
      return;
    }

    const cual = tag ? `El TAG ${tag}` : 'El TAG';
    await this.presentar(
      `${cual} no se envió al servidor`,
      [
        'El conteo está guardado en la PDA — no se perdió nada.',
        'Queda pendiente: se enviará solo cuando haya señal. También puedes reintentar desde el resumen de TAGs.',
      ],
      error,
    );
  }

  private async avisarYaSeEnvia(): Promise<void> {
    const toast = await this.toastController.create({
      message: 'Este TAG ya se está enviando. Espera unos segundos.',
      duration: 3000,
      color: 'warning',
      position: 'top',
    });
    await toast.present();
  }

  /*
   * El envío masivo no puede encadenar un diálogo por TAG fallido: con cinco
   * pendientes el operador tocaría Aceptar cinco veces y no leería ninguno. Va
   * uno solo, pero con los códigos, que es lo que necesita para saber cuáles
   * reintentar.
   */
  async avisarFalloLote(
    tagsSinEnviar: readonly (string | null)[],
    total: number,
    tagsSinConfirmar: readonly (string | null)[] = [],
  ): Promise<void> {
    const sinEnviar = tagsSinEnviar.length;
    const sinConfirmar = tagsSinConfirmar.length;
    if (sinEnviar + sinConfirmar === 0) return;

    const codigos = (tags: readonly (string | null)[]) => tags.filter((t): t is string => !!t);
    const cuales = codigos(tagsSinEnviar);
    const cualesSinConfirmar = codigos(tagsSinConfirmar);

    const header =
      sinConfirmar === 0 ? `${sinEnviar} de ${total} TAGs no se enviaron`
      : sinEnviar === 0  ? `${sinConfirmar} de ${total} TAGs sin confirmar`
      : `${sinEnviar + sinConfirmar} de ${total} TAGs con problemas de envío`;

    // Con los dos casos juntos las etiquetas aclaran cuál es cuál; solos, basta con "TAGs".
    const etiquetaSinEnviar = sinConfirmar === 0 ? 'TAGs' : 'No se enviaron';

    await this.presentar(
      header,
      [
        cuales.length > 0 ? `${etiquetaSinEnviar}: ${cuales.join(', ')}.` : '',
        cualesSinConfirmar.length > 0 ? `Sin confirmar: ${cualesSinConfirmar.join(', ')}.` : '',
        'Los conteos están guardados en la PDA — no se perdió nada.',
        sinConfirmar > 0
          ? 'Los sin confirmar pueden estar ya en el servidor: no los vuelvas a contar, la PDA los verificará sola.'
          : '',
        'Se reintentará solo cuando haya señal.',
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
