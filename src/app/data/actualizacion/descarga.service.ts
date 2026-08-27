import { Injectable, isDevMode } from '@angular/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import {
  DescargaRepository,
  DescargaProgreso,
} from '../../domain/actualizacion/repositories/actualizacion.repository';
import { Actualizador } from './actualizador.plugin';

/*
 * Baja el APK al disco de la PDA.
 *
 * La descarga la hace Filesystem de forma NATIVA, no el WebView. Dos razones,
 * y las dos importan:
 *
 *   - Son ~28 MB. Pasarlos por fetch significa tenerlos en memoria del WebView
 *     antes de escribirlos.
 *   - No pasa por las reglas de origen. Por eso la carpeta del APK en el
 *     servidor no necesita headers de CORS, a diferencia del manifiesto.
 *
 * Va a Directory.Cache a propósito: es la carpeta que el FileProvider ya expone
 * (cache-path en file_paths.xml) y la que Android puede vaciar si el equipo se
 * queda sin espacio. Un APK ya instalado no hace falta conservarlo.
 */

const NOMBRE_ARCHIVO = 'actualizacion.apk';

@Injectable({ providedIn: 'root' })
export class CapacitorDescargaService implements DescargaRepository {

  async descargar(url: string, onProgreso?: (p: DescargaProgreso) => void): Promise<string> {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('La descarga sólo funciona en la PDA.');
    }

    /*
     * Se borra cualquier descarga previa antes de empezar. Sin esto, una
     * descarga interrumpida deja un archivo a medias con el nombre correcto, y
     * el intento siguiente podría encontrárselo ahí — con el hash equivocado y
     * sin ninguna pista de por qué.
     */
    await this.borrar(NOMBRE_ARCHIVO);

    let listener: { remove: () => Promise<void> } | null = null;
    if (onProgreso) {
      listener = await Filesystem.addListener('progress', (e: { bytes: number; contentLength: number }) => {
        // contentLength llega en 0 si el servidor no manda Content-Length. Se
        // informa null en vez de un porcentaje inventado, y la pantalla muestra
        // un spinner indeterminado.
        const total = e.contentLength;
        onProgreso({ porcentaje: total > 0 ? Math.round((e.bytes / total) * 100) : null });
      });
    }

    try {
      const resultado = await Filesystem.downloadFile({
        url,
        path:      NOMBRE_ARCHIVO,
        directory: Directory.Cache,
        progress:  !!onProgreso,
      });

      const ruta = resultado.path;
      if (!ruta) throw new Error('La descarga no devolvió una ruta de archivo.');

      if (isDevMode()) console.log('[Descarga] APK en', ruta);
      return ruta;
    } finally {
      await listener?.remove();
    }
  }

  /*
   * El hash lo calcula el plugin nativo, no crypto.subtle: esa API no tiene
   * streaming y exige el archivo entero en un ArrayBuffer. Ver el método hash
   * de ActualizadorPlugin.java.
   */
  async hashDe(ruta: string): Promise<string> {
    const { valor } = await Actualizador.hash({ ruta });
    return valor.toLowerCase();
  }

  async borrar(ruta: string): Promise<void> {
    try {
      // Se acepta tanto la ruta absoluta que devuelve la descarga como el
      // nombre suelto, para que el borrado preventivo de arriba funcione antes
      // de que exista ninguna ruta.
      const esAbsoluta = ruta.includes('/');
      await Filesystem.deleteFile(
        esAbsoluta
          ? { path: ruta }
          : { path: ruta, directory: Directory.Cache }
      );
    } catch {
      // No existía. Es el caso normal en el borrado preventivo.
    }
  }
}
