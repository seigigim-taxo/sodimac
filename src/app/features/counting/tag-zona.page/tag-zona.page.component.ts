import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, arrowForwardOutline, barcodeOutline, listOutline, lockClosedOutline } from 'ionicons/icons';
import { EventoFacade } from '../../../state/evento/evento.facade';
import { TagARecontarMock, TagsMockStore, ZONAS_MOCK, ZonaMock } from '../../../state/counting-mock/tags-mock.store';
import { TagSesionStore } from '../../../state/counting-mock/tag-sesion.store';
import { stripEmojis } from '../../../shared/utils/text.utils';

/*
 * MOCK — pantalla previa al conteo: se ingresa el TAG y se elige la zona,
 * y desde acá se pasa a la pantalla de conteo (SKU + cantidad). Separada
 * de la pantalla de conteo para que el operador pueda ir al resumen entre
 * un TAG y el siguiente, sin mezclarse con el escaneo.
 */
@Component({
  selector: 'app-tag-zona-page',
  templateUrl: './tag-zona.page.component.html',
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonMenuButton,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToolbar,
  ],
})
export class TagZonaPageComponent {
  @ViewChild('zonaSelect') zonaSelect!: IonSelect;
  @ViewChild('tagInputEl') tagInputEl!: ElementRef<HTMLIonInputElement>;

  private router       = inject(Router);
  private eventoFacade = inject(EventoFacade);
  private tagsStore    = inject(TagsMockStore);
  private tagSesion    = inject(TagSesionStore);

  currentEvent = this.eventoFacade.selectedEvent;
  zonas        = ZONAS_MOCK;

  tagInputValue = signal('');
  tagError      = signal<string | null>(null);
  tagActual     = this.tagSesion.tagActual;
  zonaActual    = this.tagSesion.zonaActual;

  tagsHoy              = this.tagsStore.tags;
  iteracionActual      = this.tagsStore.iteracionActual;
  modoActual           = this.tagsStore.modoActual;
  totalFaltantes       = this.tagsStore.totalFaltantes;
  tagsPorRecontar      = this.tagsStore.tagsPorRecontarPendientes;

  // TAG elegido desde la lista de reconteo, pendiente de ingresar/validar antes de confirmarlo.
  tagRecontarSeleccionado = signal<TagARecontarMock | null>(null);
  tagRecontarInput        = signal('');
  tagRecontarError        = signal<string | null>(null);

  constructor() {
    addIcons({ alertCircleOutline, arrowForwardOutline, barcodeOutline, listOutline, lockClosedOutline });
  }

  seleccionarTagRecontar(t: TagARecontarMock): void {
    this.tagRecontarSeleccionado.set(t);
    this.tagRecontarInput.set('');
    this.tagRecontarError.set(null);
  }

  onTagRecontarInput(event: Event): void {
    const value = (event as CustomEvent<{ value: string | null }>).detail.value ?? '';
    this.tagRecontarInput.set(stripEmojis(value));
  }

  // Resuelven tag/zona desde sod_ubicacion (mock) por id — TagARecontarMock no los lleva propios.
  codigoDeUbicacion(ubicacionId: number): string {
    return this.tagsStore.obtenerUbicacion(ubicacionId)?.tag ?? '';
  }

  zonaDeUbicacion(ubicacionId: number): string {
    return this.tagsStore.obtenerUbicacion(ubicacionId)?.zonaCodigo ?? '';
  }

  confirmarTagRecontar(): void {
    const seleccionado = this.tagRecontarSeleccionado();
    if (!seleccionado) return;
    const ubicacion = this.tagsStore.obtenerUbicacion(seleccionado.ubicacionId);
    if (!ubicacion) return;

    const value = this.tagRecontarInput().trim().toUpperCase();
    if (!value) return;

    if (value !== ubicacion.tag) {
      this.tagRecontarError.set(`Ese TAG no corresponde — se esperaba ${ubicacion.tag}`);
      return;
    }

    const zona = this.zonas.find((z) => z.codigo === ubicacion.zonaCodigo) ?? this.zonas[0];
    // Items vacíos a propósito: el reconteo arranca en 0, no reutiliza lo contado antes.
    this.tagSesion.iniciar(ubicacion.tag, zona, []);
    this.tagRecontarSeleccionado.set(null);
  }

  // Vuelve a la lista de TAGs a recontar sin haber validado el ingreso — el operador se arrepintió.
  cancelarTagRecontar(): void {
    this.tagRecontarSeleccionado.set(null);
    this.tagRecontarInput.set('');
    this.tagRecontarError.set(null);
  }

  // Deshace la selección ya confirmada y vuelve a la lista de TAGs a recontar, aunque sea uno solo —
  // el operador debe poder arrepentirse antes de iniciar el reconteo.
  cambiarTagRecontar(): void {
    this.tagSesion.reset();
  }

  onTagInput(event: Event): void {
    const value = (event as CustomEvent<{ value: string | null }>).detail.value ?? '';
    this.tagInputValue.set(stripEmojis(value));
  }

  confirmarTag(): void {
    const value = this.tagInputValue().trim().toUpperCase();
    if (!value) return;

    const estado = this.tagsStore.estadoDe(value);
    if (estado === 'ENVIADO') {
      this.tagError.set(`El TAG ${value} ya fue enviado — no se puede reabrir`);
      return;
    }

    this.tagError.set(null);
    this.tagInputValue.set('');

    if (estado === 'PENDIENTE') {
      // Se reabre: TAG + zona quedan confirmados con lo ya cargado, listo para "Ir a contar".
      const tag       = this.tagsStore.obtenerTagPorCodigo(value);
      const ubicacion = tag ? this.tagsStore.obtenerUbicacion(tag.ubicacionId) : undefined;
      const zona      = this.zonas.find((z) => z.codigo === ubicacion?.zonaCodigo) ?? this.zonas[0];
      this.tagSesion.iniciar(value, zona, tag?.items ?? []);
      return;
    }

    this.tagSesion.tagActual.set(value);
    requestAnimationFrame(() => this.zonaSelect?.open());
  }

  onZonaChange(event: Event): void {
    const zona = (event as CustomEvent<{ value: ZonaMock | null }>).detail.value;
    if (!zona) return;
    this.tagSesion.zonaActual.set(zona);
  }

  cancelarTag(): void {
    this.tagSesion.reset();
    this.tagInputValue.set('');
    this.tagError.set(null);
    setTimeout(() => this.tagInputEl?.nativeElement?.setFocus?.(), 80);
  }

  irAContar(): void {
    if (!this.tagActual() || !this.zonaActual()) return;
    this.router.navigate(['/counting']);
  }

  goToResumen(): void {
    this.router.navigate(['/tags-resumen']);
  }
}
