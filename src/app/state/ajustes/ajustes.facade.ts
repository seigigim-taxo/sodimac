import { Injectable, inject, signal } from '@angular/core';
import { AJUSTES_STORAGE_REPOSITORY_TOKEN } from '../../domain/ajustes/repositories/ajustes-storage.repository';
import { ModoCaptura } from '../../domain/conteo/models/modo-captura.model';

/*
 * Ajustes de operación de la PDA.
 *
 * `modoCapturaPreferido` es con qué modo arranca cada TAG nuevo — "uno a uno" o
 * "por cantidad" — hasta que el operador lo cambie. Es una preferencia de la
 * PDA y no del operador: no distingue quién inició sesión. Cualquiera que use
 * el equipo hereda el último modo que quedó elegido.
 *
 * Ya no existe el ajuste de sincronización automática: finalizar un TAG siempre
 * intenta enviarlo. Que un TAG quede editable ya no depende de un interruptor
 * sino de lo que se sabe de su envío (ver estado-envio-tag.model.ts).
 */
@Injectable({ providedIn: 'root' })
export class AjustesFacade {
  private storage = inject(AJUSTES_STORAGE_REPOSITORY_TOKEN);

  private modoCapturaPreferidoSignal = signal<ModoCaptura>('cantidad');

  readonly modoCapturaPreferido = this.modoCapturaPreferidoSignal.asReadonly();

  /*
   * Se carga en el arranque, antes de que el operador pueda finalizar un TAG.
   *
   * También borra el ajuste de sincronización automática que una versión
   * anterior pudo dejar guardado. Si falla no importa: nada lo lee.
   */
  async init(): Promise<void> {
    await this.storage.eliminarSincronizacionAutomatica().catch((err) => {
      console.error('[AjustesFacade] no se pudo borrar el ajuste de sincronización automática:', err);
    });

    const modo = await this.storage.cargarModoCapturaPreferido();
    if (modo !== null) this.modoCapturaPreferidoSignal.set(modo);
  }

  async setModoCapturaPreferido(modo: ModoCaptura): Promise<void> {
    if (modo === this.modoCapturaPreferidoSignal()) return;
    await this.storage.guardarModoCapturaPreferido(modo);
    this.modoCapturaPreferidoSignal.set(modo);
  }
}
