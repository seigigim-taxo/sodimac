import { Component, computed, inject } from '@angular/core';
import { AuthFacade } from '../../../state/auth/auth.facade';
import { SucursalFacade } from '../../../state/sucursal/sucursal.facade';
import { APP_VERSION } from '../../../core/version';
import { formatRutDisplay } from '../../utils/rut.utils';

@Component({
  selector: 'app-header-status',
  standalone: true,
  template: `
    <div class="header-status">
      @if (lineaTienda(); as tienda) {
        <span class="tienda">{{ tienda }}</span>
      }
      @if (lineaPie(); as pie) {
        <span class="pie">{{ pie }}</span>
      }
    </div>
  `,
  styles: [`
    .header-status {
      display: flex;
      flex-direction: column;
      line-height: 1.25;
      text-align: center;
    }
    .tienda {
      font-size: 15px;
      font-weight: 700;
      color: var(--app-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .pie {
      font-size: 11px;
      font-weight: 400;
      color: var(--app-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
  `],
})
export class HeaderStatusComponent {
  private auth            = inject(AuthFacade);
  private sucursalFacade  = inject(SucursalFacade);

  version = APP_VERSION;

  private session      = this.auth.session;
  private currentStore = this.sucursalFacade.currentStore;

  lineaTienda = computed(() => {
    const store = this.currentStore();
    if (!store) return null;
    return `${store.nombre} (${store.codigoTienda})`;
  });

  lineaPie = computed(() => {
    const session = this.session();
    const rut = session ? formatRutDisplay(session.rutNormalizado) : null;
    return [rut, `v${this.version}`].filter(Boolean).join(' · ');
  });
}
