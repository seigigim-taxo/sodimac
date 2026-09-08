import { Component, computed, inject, input } from '@angular/core';
import { AuthFacade } from '../../../state/auth/auth.facade';
import { SucursalFacade } from '../../../state/sucursal/sucursal.facade';
import { APP_VERSION } from '../../../core/version';
import { formatRutDisplay } from '../../utils/rut.utils';

/*
 * Título de toolbar compartido por Home, Tag, Zona y Resumen: el indicador de
 * conexión (que ya vivía duplicado en las 4 páginas) más una segunda línea
 * con rut, correo, tienda y versión, para que un operador que reporta algo
 * desde terreno no tenga que ir al menú lateral a buscarlos.
 *
 * `isOnline` entra por input porque cada página ya tiene su propia señal de
 * NetworkService inyectada (para el resto de su lógica); rut/correo/tienda/
 * versión en cambio se leen directo de sus facades acá adentro, porque no
 * cambian según la página y no vale la pena repetir el input cuatro veces.
 */
@Component({
  selector: 'app-header-status',
  standalone: true,
  template: `
    <div class="header-status">
      <div class="fila-conexion">
        @if (isOnline()) {
          <span class="conexion" style="color: var(--app-success);">● En línea</span>
        } @else {
          <span class="conexion" style="color: var(--app-danger, #ef4444);">● Sin conexión</span>
        }
        @if (lineaTienda(); as tienda) {
          <span class="tienda">{{ tienda }}</span>
        }
      </div>
      @if (lineaUsuario(); as usuario) {
        <span class="detalle">{{ usuario }}</span>
      }
      <span class="detalle">v{{ version }}</span>
    </div>
  `,
  styles: [`
    .header-status {
      display: flex;
      flex-direction: column;
      gap: 2px;
      line-height: 1.3;
    }
    .fila-conexion {
      display: flex;
      align-items: baseline;
      gap: 6px;
    }
    .conexion {
      font-size: 14px;
      font-weight: 600;
    }
    .tienda {
      font-size: 13px;
      font-weight: 500;
      color: var(--app-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 160px;
    }
    .detalle {
      font-size: 13px;
      font-weight: 400;
      color: var(--app-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 240px;
    }
  `],
})
export class HeaderStatusComponent {
  private auth            = inject(AuthFacade);
  private sucursalFacade  = inject(SucursalFacade);

  isOnline = input.required<boolean>();

  version = APP_VERSION;

  private session      = this.auth.session;
  private currentStore = this.sucursalFacade.currentStore;

  lineaUsuario = computed(() => {
    const session = this.session();
    if (!session) return null;
    const rut = formatRutDisplay(session.rutNormalizado);
    return `${rut} · ${session.correo}`;
  });

  lineaTienda = computed(() => {
    const store = this.currentStore();
    if (!store) return null;
    return `${store.nombre} (${store.codigoTienda})`;
  });
}
