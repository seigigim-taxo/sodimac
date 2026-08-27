import { Injectable, isDevMode } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { InstaladorRepository } from '../../domain/actualizacion/repositories/actualizacion.repository';
import { Actualizador } from './actualizador.plugin';

/*
 * El instalador del sistema, detrás de la interfaz del dominio.
 *
 * En navegador —tests, ng serve— todo devuelve valores inertes en vez de
 * romper: el plugin nativo no existe ahí, y que la pantalla de actualización
 * reviente en desarrollo no ayuda a nadie.
 */
@Injectable({ providedIn: 'root' })
export class CapacitorInstaladorService implements InstaladorRepository {
  private get enDispositivo(): boolean {
    return Capacitor.isNativePlatform();
  }

  /*
   * La versión instalada se lee del sistema, no de la constante APP_VERSION del
   * código. Esa se escribe a mano y puede quedar desincronizada del
   * build.gradle; lo que Android compara para decidir si una APK es más nueva
   * es este número y ningún otro.
   */
  async versionInstalada(): Promise<number> {
    if (!this.enDispositivo) return 0;

    const info = await App.getInfo();
    const build = Number(info.build);
    return Number.isInteger(build) ? build : 0;
  }

  async puedeInstalar(): Promise<boolean> {
    if (!this.enDispositivo) return false;

    const { valor } = await Actualizador.puedeInstalar();
    if (isDevMode()) console.log('[Instalador] puedeInstalar', valor);
    return valor;
  }

  async abrirAjustesInstalacion(): Promise<void> {
    if (!this.enDispositivo) return;
    await Actualizador.abrirAjustesInstalacion();
  }

  async instalar(ruta: string): Promise<void> {
    if (!this.enDispositivo) {
      throw new Error('La instalación sólo funciona en la PDA.');
    }
    await Actualizador.instalar({ ruta });
  }
}
