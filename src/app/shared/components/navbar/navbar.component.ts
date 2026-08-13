import { Component, signal } from '@angular/core';
import { IonIcon, IonModal } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, searchOutline } from 'ionicons/icons';
import { BuscadorSkuComponent } from '../buscador-sku/buscador-sku.component';

/*
 * Barra de navegación de la app.
 *
 * Vive una sola vez en AppComponent, por debajo del router-outlet, así que
 * acompaña al operador en todas las pantallas del proceso. Es el reemplazo del
 * menú lateral como sitio del buscador: el menú obligaba a abrirlo, leerlo y
 * cerrarlo para una acción que se usa en medio del conteo.
 *
 * Hoy tiene una sola acción —el buscador SKU → TAG—, y está armada como lista
 * de ítems justamente porque va a crecer.
 */
@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  imports: [BuscadorSkuComponent, IonIcon, IonModal],
})
export class NavbarComponent {
  buscadorAbierto = signal(false);

  constructor() {
    addIcons({ closeOutline, searchOutline });
  }

  abrirBuscador(): void {
    this.buscadorAbierto.set(true);
  }

  cerrarBuscador(): void {
    this.buscadorAbierto.set(false);
  }
}
