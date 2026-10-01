import { Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

/*
 * Card con un botón de cabecera (ícono + label + chevron) que
 * expande/colapsa contenido — el dueño del estado es quien la usa, acá
 * solo vive la estructura y el ícono que cambia según `visible`.
 *
 * Extraído porque la misma estructura apareció dos veces en
 * CountingPageComponent (Resumen de avance / referencia de un TAG
 * sincronizado), copiada tal cual entre una y otra.
 */
@Component({
  selector: 'app-card-colapsable',
  standalone: true,
  imports: [IonIcon],
  templateUrl: './card-colapsable.component.html',
  // El host es un custom element: sin esto queda `display: inline` por
  // defecto, distinto al <div class="card"> que reemplaza.
  styles: [':host { display: block; }'],
})
export class CardColapsableComponent {
  icon      = input.required<string>();
  label     = input.required<string>();
  visible   = input.required<boolean>();
  // La card de "Resumen de avance" usa var(--app-primary) para su ícono; el resto, el muted por defecto.
  iconColor = input('var(--app-text-muted)');

  // No se llama "toggle": colisiona con el evento DOM nativo del mismo nombre.
  alternar = output<void>();
}
