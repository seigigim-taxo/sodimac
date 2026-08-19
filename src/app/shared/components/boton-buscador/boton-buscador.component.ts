import { Component, inject } from '@angular/core';
import { IonIcon, IonModal } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { BuscadorSkuComponent } from '../buscador-sku/buscador-sku.component';
import { BuscadorService } from '../../services/buscador.service';

/*
 * Modal del buscador SKU. Vive una sola vez en AppComponent, fuera del
 * router-outlet, así que no se remonta en cada navegación.
 *
 * El botón que lo abre está en la toolbar de cada página (icono de lupa a la
 * izquierda del menú hamburguesa). La comunicación es vía BuscadorService.
 */
@Component({
  selector: 'app-boton-buscador',
  templateUrl: './boton-buscador.component.html',
  imports: [BuscadorSkuComponent, IonIcon, IonModal],
})
export class BotonBuscadorComponent {
  private buscador = inject(BuscadorService);

  readonly abierto = this.buscador.abierto;

  constructor() {
    addIcons({ closeOutline });
  }

  cerrarBuscador(): void {
    this.buscador.cerrar();
  }
}
