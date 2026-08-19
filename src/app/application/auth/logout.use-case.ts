import { Injectable, inject } from '@angular/core';
import { SESSION_STORAGE_REPOSITORY_TOKEN } from '../../domain/auth/repositories/session-storage.repository';
import { EVENTO_SELECCIONADO_STORAGE_TOKEN } from '../../domain/evento/repositories/evento-seleccionado-storage.repository';

@Injectable({ providedIn: 'root' })
export class LogoutUseCase {
  private sessionStorage = inject(SESSION_STORAGE_REPOSITORY_TOKEN);
  private eventoStorage  = inject(EVENTO_SELECCIONADO_STORAGE_TOKEN);

  /*
   * El evento elegido se borra junto con la sesión: es del operador que se va,
   * y la PDA se pasa entre turnos. Lo contado sigue en SQLite — eso pertenece
   * al evento, no a la sesión.
   */
  async execute(): Promise<void> {
    await this.sessionStorage.clear();
    await this.eventoStorage.limpiar();
  }
}
