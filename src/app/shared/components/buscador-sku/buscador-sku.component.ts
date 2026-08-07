import { Component, computed, inject, signal } from '@angular/core';
import { AlertController, IonButton, IonIcon, IonInput, MenuController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { searchOutline } from 'ionicons/icons';
import { EventoFacade } from '../../../state/evento/evento.facade';
import { BuscarSkuUseCase } from '../../../application/conteo/buscar-sku.use-case';
import { BusquedaSkuResultado } from '../../../domain/conteo/models/busqueda-sku.model';

/*
 * Buscador SKU → TAG. Responde "¿dónde se contó este SKU?" para la jornada de
 * inventario completa —todas las rondas, no solo la activa—, y un mismo SKU
 * puede aparecer en varios TAG.
 *
 * Vive en el menú lateral de la app (app.component), no en cada pantalla: tiene
 * que estar disponible en TODAS las etapas del proceso — elegir TAG, contar,
 * revisar el avance — y el menú es el único punto que ya alcanzan todas.
 *
 * No expone cantidades esperadas — muestra lo efectivamente contado, que es un
 * hecho ya registrado, no la expectativa del sistema. No rompe el conteo a ciegas.
 */
@Component({
  selector: 'app-buscador-sku',
  templateUrl: './buscador-sku.component.html',
  imports: [IonButton, IonIcon, IonInput],
})
export class BuscadorSkuComponent {
  private alertController = inject(AlertController);
  private menuController  = inject(MenuController);
  private eventoFacade    = inject(EventoFacade);
  private buscarSkuUC     = inject(BuscarSkuUseCase);

  valor    = signal('');
  buscando = signal(false);
  // Sin evento seleccionado no hay dónde buscar: se muestra la razón en vez de
  // un formulario que no haría nada al apretarlo.
  hayEvento = computed(() => this.eventoFacade.selectedEvent() !== null);

  constructor() {
    addIcons({ searchOutline });
  }

  onInput(event: Event): void {
    this.valor.set((event as CustomEvent<{ value: string | null }>).detail.value ?? '');
  }

  async buscar(): Promise<void> {
    const sku    = this.valor().trim();
    const evento = this.eventoFacade.selectedEvent();
    if (!sku || !evento || this.buscando()) return;

    this.buscando.set(true);
    try {
      const resultados = await this.buscarSkuUC.execute(evento.id, sku);

      /*
       * Texto plano con saltos de línea: Ionic escapa el HTML del `message`, así
       * que un <br> se vería literal en pantalla.
       */
      const message = resultados.length === 0
        ? `No se ha registrado el SKU ${sku} en este inventario.`
        : resultados.map((r) => this.formatearResultado(r)).join('\n');

      // Cierra el menú antes de mostrar el resultado: si no, el alert queda
      // encima del menú abierto y al cerrarlo se vuelve al menú, no a la pantalla.
      // No-op si el componente se usara fuera del menú.
      await this.menuController.close();

      const alert = await this.alertController.create({
        header: `Resultados para ${sku}`,
        message,
        buttons: ['Cerrar'],
      });
      await alert.present();
    } finally {
      this.buscando.set(false);
    }
  }

  /*
   * "Iteración 1 · TAG 038 · A3 (Pasillo herramientas) · 12 unidad(es)".
   *
   * La iteración va primero porque es lo que ordena la lista: al recontar, lo
   * primero que necesita saber el operador es si ese TAG es de la ronda en la
   * que está o de una anterior.
   */
  private formatearResultado(r: BusquedaSkuResultado): string {
    const zona = r.zonaNombre ? `${r.zonaCodigo} (${r.zonaNombre})` : r.zonaCodigo;
    return `Iteración ${r.iteracion} · TAG ${r.tag ?? '—'} · ${zona} · ${r.cantidad} unidad(es)`;
  }
}
