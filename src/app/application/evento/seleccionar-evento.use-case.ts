import { Injectable, inject } from '@angular/core';
import { EVENTO_SELECCIONADO_STORAGE_TOKEN } from '../../domain/evento/repositories/evento-seleccionado-storage.repository';

/*
 * Deja registrado el evento en el que está trabajando la PDA para que la
 * selección sobreviva a un reinicio del equipo. Se guarda solo el id: el evento
 * se relee de la base al restaurar, así el estado nunca queda congelado.
 */
@Injectable({ providedIn: 'root' })
export class SeleccionarEventoUseCase {
  private storage = inject(EVENTO_SELECCIONADO_STORAGE_TOKEN);

  async execute(eventoId: number): Promise<void> {
    await this.storage.guardar(eventoId);
  }

  async limpiar(): Promise<void> {
    await this.storage.limpiar();
  }
}
