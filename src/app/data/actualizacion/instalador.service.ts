import { Injectable, inject, isDevMode } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { InstaladorRepository } from '../../domain/actualizacion/repositories/actualizacion.repository';
import { Actualizador } from './actualizador.plugin';
import { AppInfoService } from '../../core/app-info.service';

/*
 * El instalador del sistema, detrás de la interfaz del dominio.
 *
 * En navegador —tests, ng serve— todo devuelve valores inertes en vez de
 * romper: el plugin nativo no existe ahí, y que la pantalla de actualización
 * reviente en desarrollo no ayuda a nadie.
 */
@Injectable({ providedIn: 'root' })
export class CapacitorInstaladorService implements InstaladorRepository {
  private appInfo = inject(AppInfoService);

  private get enDispositivo(): boolean {
    return Capacitor.isNativePlatform();
  }

  /*
   * La versión instalada se lee del sistema, no de la constante APP_VERSION del
   * código. Esa se escribe a mano y puede quedar desincronizada del
   * build.gradle; lo que Android compara para decidir si una APK es más nueva
   * es este número y ningún otro.
   *
   * Se delega en AppInfoService y no se lee App.getInfo() acá. Cuando estaban
   * las dos lecturas ya se comportaban distinto: esta no atrapaba el error, así
   * que un plugin que no responde tiraba la excepción hacia arriba y rompía la
   * consulta de actualizaciones, mientras que la otra degradaba a 0.
   *
   * El 0 significa "no se pudo leer", y aguas arriba eso vale como "cualquier
   * versión del servidor es más nueva" (ver BuscarActualizacionUseCase). Es
   * deliberado para la consulta manual del menú, pero por eso mismo no puede
   * haber dos caminos que decidan cuándo devolverlo.
   */
  async versionInstalada(): Promise<number> {
    return (await this.appInfo.version()).codigo;
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
