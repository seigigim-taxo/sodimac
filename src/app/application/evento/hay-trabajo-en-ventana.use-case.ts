import { Injectable, inject } from '@angular/core';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';
import { SUCURSAL_REPOSITORY_TOKEN } from '../../domain/sucursal/repositories/sucursal.repository';
import { enVentanaOperativa } from '../../shared/utils/fecha.utils';

/*
 * ¿Queda algo que el operador pueda contar HOY con lo que ya tiene bajado?
 *
 * Existe por el cambio de día. Hasta acá, que la preparación fuera de ayer
 * significaba una sola cosa —datos viejos, se cierra la sesión— porque la app
 * bajaba un solo día y al cambiar la fecha no quedaba nada válido.
 *
 * Con la ventana de dos días eso dejó de ser cierto: el operador que preparó
 * ayer se bajó también la jornada de hoy. Cerrarle la sesión lo mandaría al
 * login, y volver a entrar exige sincronizar, o sea señal — que es justo lo que
 * la ventana venía a evitar. Se quedaría afuera con el trabajo del día en el
 * bolsillo.
 *
 * Mira SQLite y no la respuesta del servidor a propósito: la pregunta es si la
 * PDA puede seguir trabajando SIN RED.
 */
@Injectable({ providedIn: 'root' })
export class HayTrabajoEnVentanaUseCase {
  private sucursalRepo = inject(SUCURSAL_REPOSITORY_TOKEN);
  private eventoRepo   = inject(EVENTO_REPOSITORY_TOKEN);

  async execute(operadorId: number): Promise<boolean> {
    const sucursales = await this.sucursalRepo.getByUsuario(operadorId);

    /*
     * Se recorren todas las tiendas del operador, no solo la que tiene abierta
     * en pantalla: al operador se lo asigna por jornada, no por local, y la
     * jornada de hoy puede ser en otra tienda.
     */
    for (const sucursal of sucursales) {
      const eventos = await this.eventoRepo.getBySucursal(sucursal.id);

      const hay = eventos.some(
        (e) => e.estado === 'ABIERTO' && enVentanaOperativa(e.fechaProgramada)
      );
      if (hay) return true;
    }

    return false;
  }
}
