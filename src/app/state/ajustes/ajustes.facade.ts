import { Injectable, inject, signal } from '@angular/core';
import { AJUSTES_STORAGE_REPOSITORY_TOKEN } from '../../domain/ajustes/repositories/ajustes-storage.repository';

/*
 * Ajustes de operación de la PDA.
 *
 * `sincronizacionAutomatica` decide si un TAG se sube al servidor apenas se
 * finaliza. Encendido por defecto, que es como trabajó la app hasta ahora.
 *
 * Apagarlo deja el TAG en FINALIZADO en vez de SINCRONIZADO, y eso es lo que
 * habilita el botón "Editar" del resumen: un TAG ya sincronizado es inmutable,
 * así que sin este interruptor la única forma de corregir algo era quedarse sin
 * señal en el momento justo.
 */
@Injectable({ providedIn: 'root' })
export class AjustesFacade {
  private storage = inject(AJUSTES_STORAGE_REPOSITORY_TOKEN);

  private sincronizacionAutomaticaSignal = signal(true);

  readonly sincronizacionAutomatica = this.sincronizacionAutomaticaSignal.asReadonly();

  /*
   * Se carga en el arranque, antes de que el operador pueda finalizar un TAG:
   * leerlo tarde haría que el primer TAG tras reiniciar la PDA se sincronizara
   * igual, ignorando lo que el operador había dejado configurado.
   */
  async init(): Promise<void> {
    const guardado = await this.storage.cargarSincronizacionAutomatica();
    if (guardado !== null) this.sincronizacionAutomaticaSignal.set(guardado);
  }

  async toggleSincronizacionAutomatica(): Promise<void> {
    const siguiente = !this.sincronizacionAutomaticaSignal();
    await this.storage.guardarSincronizacionAutomatica(siguiente);
    this.sincronizacionAutomaticaSignal.set(siguiente);
  }
}
