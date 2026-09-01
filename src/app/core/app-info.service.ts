import { Injectable, InjectionToken, inject } from '@angular/core';
import { App } from '@capacitor/app';
import { APP_VERSION } from './version';

/*
 * Qué versión de la app está corriendo.
 *
 * SE LEE DEL SISTEMA, no de la constante APP_VERSION.
 *
 * Esa constante se escribe a mano y se desincroniza sola: ya nos pasó tener una
 * build donde el menú mostraba 1.0.4 y el APK instalado era otro. Lo que Android
 * reporta es lo único que corresponde con el APK que de verdad produjo el dato,
 * y esa es justamente la pregunta que se le hace después a una carga del SGO:
 * "esta viene rara, ¿de qué versión salió?".
 *
 * APP_VERSION queda como respaldo. Se usa en el navegador —donde App.getInfo()
 * no existe— y ante cualquier falla del plugin.
 */

export interface VersionApp {
  /** El versionName de Android: "1.0.4". */
  nombre: string;
  /** El versionCode de Android. 0 si no se pudo leer. */
  codigo: number;
}

/*
 * La lectura del plugin, detrás de un token.
 *
 * `App` de Capacitor es un proxy: spyOn() no lo intercepta, así que sin esta
 * costura el camino bueno —el del dispositivo, el único que importa en
 * producción— no se puede probar y quedaría cubierto solo el degradado.
 */
export const LECTOR_INFO_APP = new InjectionToken<() => Promise<{ version: string; build: string }>>(
  'LectorInfoApp',
  { providedIn: 'root', factory: () => () => App.getInfo() }
);

@Injectable({ providedIn: 'root' })
export class AppInfoService {
  private leer = inject(LECTOR_INFO_APP);

  /*
   * Se consulta una vez y se guarda. La versión no cambia mientras el proceso
   * vive: instalar una actualización mata la app, así que al volver esto se
   * recalcula solo.
   *
   * Se guarda la PROMESA y no el valor. Guardando el valor, la caché recién se
   * escribe después del await, así que dos llamadas que entren antes de que la
   * primera resuelva —dos TAGs pendientes armando su payload a la vez— consultan
   * el plugin las dos. Con la promesa, la segunda se cuelga de la primera.
   */
  private cache: Promise<VersionApp> | null = null;

  version(): Promise<VersionApp> {
    this.cache ??= this.consultar();
    return this.cache;
  }

  private async consultar(): Promise<VersionApp> {
    try {
      const info = await this.leer();
      const codigo = Number(info.build);
      return {
        nombre: info.version || APP_VERSION,
        codigo: Number.isInteger(codigo) ? codigo : 0,
      };
    } catch {
      /*
       * Si no se puede leer —el navegador, o un plugin que no responde— se
       * contesta con la constante en vez de propagar. El envío de un TAG no se
       * puede caer porque no se supo decir con qué versión se contó.
       *
       * Nunca lanza, así que la promesa cacheada nunca queda rechazada: no hay
       * riesgo de dejar la caché envenenada con un error para siempre.
       */
      return { nombre: APP_VERSION, codigo: 0 };
    }
  }
}
