import { Injectable, inject, signal } from '@angular/core';
import { BuscarNuevoConteoUseCase } from '../../application/asignacion/buscar-nuevo-conteo.use-case';
import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';
import { Session } from '../../domain/auth/models/session.model';

/*
 * Estado de la PDA que terminó su conteo y espera el siguiente.
 *
 * `sinNovedad` no es un error: distingue "todavía no consultaste" de "ya
 * consultaste y el SGO no tiene nada". Sin esa diferencia, la pantalla no
 * puede decirle al operador si vale la pena volver a intentar.
 */
@Injectable({ providedIn: 'root' })
export class NuevoConteoFacade {
  private buscarUC = inject(BuscarNuevoConteoUseCase);

  private buscandoSignal   = signal(false);
  private sinNovedadSignal = signal(false);
  private errorSignal      = signal<string | null>(null);

  readonly buscando   = this.buscandoSignal.asReadonly();
  readonly sinNovedad = this.sinNovedadSignal.asReadonly();
  readonly error      = this.errorSignal.asReadonly();

  /*
   * Necesita la sesión porque la consulta va contra el endpoint de preparación,
   * que identifica al operador por correo y rut. Antes alcanzaba con la tienda:
   * el endpoint liviano que se había pedido nunca existió.
   */
  async buscar(session: Session, sucursalId: number): Promise<AsignacionConteo | null> {
    this.buscandoSignal.set(true);
    this.sinNovedadSignal.set(false);
    this.errorSignal.set(null);
    try {
      const asignacion = await this.buscarUC.execute(session, sucursalId);
      this.sinNovedadSignal.set(asignacion === null);
      return asignacion;
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
    this.errorSignal.set(null);
  }
}
