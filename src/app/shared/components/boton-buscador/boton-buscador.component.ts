import { Component, signal } from '@angular/core';
import { IonFab, IonFabButton, IonIcon, IonModal } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, searchOutline } from 'ionicons/icons';
import { BuscadorSkuComponent } from '../buscador-sku/buscador-sku.component';

/*
 * Acceso al buscador SKU desde cualquier pantalla del proceso.
 *
 * Vive una sola vez en AppComponent, fuera del router-outlet, así que no se
 * remonta en cada navegación y acompaña al operador todo el recorrido.
 *
 * Es un botón flotante y no una barra: la barra reservaba una franja fija al
 * pie, y cada pantalla tenía que compensarla con padding para no quedar tapada.
 * El flotante se superpone y no le quita alto a nada.
 */
@Component({
  selector: 'app-boton-buscador',
  templateUrl: './boton-buscador.component.html',
  imports: [BuscadorSkuComponent, IonFab, IonFabButton, IonIcon, IonModal],
})
export class BotonBuscadorComponent {
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
