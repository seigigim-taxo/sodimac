import { Injectable, inject, signal } from '@angular/core';
import { AJUSTES_STORAGE_REPOSITORY_TOKEN } from '../../domain/ajustes/repositories/ajustes-storage.repository';
import { ModoCaptura } from '../../domain/conteo/models/modo-captura.model';

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
 *
 * `modoCapturaPreferido` es con qué modo arranca cada TAG nuevo — "uno a uno" o
 * "por cantidad" — hasta que el operador lo cambie. Es una preferencia de la
 * PDA y no del operador: no distingue quién inició sesión, igual que
 * `sincronizacionAutomatica`. Cualquiera que use el equipo hereda el último
 * modo que quedó elegido.
 */
@Injectable({ providedIn: 'root' })
export class AjustesFacade {
  private storage = inject(AJUSTES_STORAGE_REPOSITORY_TOKEN);

  private sincronizacionAutomaticaSignal = signal(true);
  private modoCapturaPreferidoSignal = signal<ModoCaptura>('cantidad');

  readonly sincronizacionAutomatica = this.sincronizacionAutomaticaSignal.asReadonly();
  readonly modoCapturaPreferido = this.modoCapturaPreferidoSignal.asReadonly();

  /*
   * Se carga en el arranque, antes de que el operador pueda finalizar un TAG:
   * leerlo tarde haría que el primer TAG tras reiniciar la PDA se sincronizara
   * igual, ignorando lo que el operador había dejado configurado.
   */
  async init(): Promise<void> {
    const guardado = await this.storage.cargarSincronizacionAutomatica();
    if (guardado !== null) this.sincronizacionAutomaticaSignal.set(guardado);

    const modo = await this.storage.cargarModoCapturaPreferido();
    if (modo !== null) this.modoCapturaPreferidoSignal.set(modo);
  }

  async toggleSincronizacionAutomatica(): Promise<void> {
    const siguiente = !this.sincronizacionAutomaticaSignal();
    await this.storage.guardarSincronizacionAutomatica(siguiente);
    this.sincronizacionAutomaticaSignal.set(siguiente);
  }

  async setModoCapturaPreferido(modo: ModoCaptura): Promise<void> {
    if (modo === this.modoCapturaPreferidoSignal()) return;
    await this.storage.guardarModoCapturaPreferido(modo);
    this.modoCapturaPreferidoSignal.set(modo);
  }
}
