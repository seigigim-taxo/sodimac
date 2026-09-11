import { Component, inject } from '@angular/core';
import { IonIcon, IonModal } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { CalculadoraComponent } from '../calculadora/calculadora.component';
import { CalculadoraService } from '../../services/calculadora.service';

/*
 * Modal de la calculadora. Vive una sola vez en AppComponent, fuera del
 * router-outlet, así que no se remonta en cada navegación — igual que
 * BotonBuscadorComponent.
 *
 * Se abre desde el menú lateral. La comunicación es vía CalculadoraService.
 */
@Component({
  selector: 'app-boton-calculadora',
  templateUrl: './boton-calculadora.component.html',
  imports: [CalculadoraComponent, IonIcon, IonModal],
})
export class BotonCalculadoraComponent {
  private calculadora = inject(CalculadoraService);

  readonly abierto = this.calculadora.abierto;

  constructor() {
    addIcons({ closeOutline });
  }

  cerrarCalculadora(): void {
    this.calculadora.cerrar();
  }
}
