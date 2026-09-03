import { Injectable, inject, signal } from '@angular/core';
import { BuscarOReabrirConteoUseCase } from '../../application/asignacion/buscar-o-reabrir-conteo.use-case';
import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';
import { Session } from '../../domain/auth/models/session.model';

/*
 * Estado de la PDA que terminó su conteo y espera el siguiente.
 *
 * `sinNovedad` no es un error: distingue "todavía no consultaste" de "ya
 * consultaste y el SGO no tiene nada". Sin esa diferencia, la pantalla no
 * puede decirle al operador si vale la pena volver a intentar.
 *
 * `reabierto` distingue, dentro de "sí hay algo para trabajar", si es un
 * conteo genuinamente nuevo o si es el mismo que el operador acaba de cerrar
 * y que BuscarOReabrirConteoUseCase deshizo por él — la pantalla no puede
 * llamarlo "nuevo" sin confundirlo.
 */
@Injectable({ providedIn: 'root' })
export class NuevoConteoFacade {
  private buscarUC = inject(BuscarOReabrirConteoUseCase);

  private buscandoSignal   = signal(false);
  private sinNovedadSignal = signal(false);
  private reabiertoSignal  = signal(false);
  private errorSignal      = signal<string | null>(null);

  readonly buscando   = this.buscandoSignal.asReadonly();
  readonly sinNovedad = this.sinNovedadSignal.asReadonly();
  readonly reabierto  = this.reabiertoSignal.asReadonly();
  readonly error      = this.errorSignal.asReadonly();

  /*
   * Necesita la sesión porque la consulta va contra el endpoint de preparación,
   * que identifica al operador por correo y rut.
   *
   * NO recibe la tienda: la del conteo nuevo sale de la propia respuesta, que
   * puede traer otra distinta a la que el operador tiene abierta.
   */
  async buscar(session: Session): Promise<AsignacionConteo | null> {
    this.buscandoSignal.set(true);
    this.sinNovedadSignal.set(false);
    this.reabiertoSignal.set(false);
    this.errorSignal.set(null);
    try {
      const resultado = await this.buscarUC.execute(session);

      switch (resultado.tipo) {
        case 'SIN_NOVEDAD':
          this.sinNovedadSignal.set(true);
          return null;
        case 'REABIERTO':
          this.reabiertoSignal.set(true);
          return resultado.asignacion;
        case 'NUEVO':
          return resultado.asignacion;
      }
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'No se pudo consultar al SGO');
      return null;
    } finally {
      this.buscandoSignal.set(false);
    }
  }

  /* Al cambiar de evento el aviso deja de aplicar. */
  limpiar(): void {
    this.sinNovedadSignal.set(false);
    this.reabiertoSignal.set(false);
    this.errorSignal.set(null);
  }
}
