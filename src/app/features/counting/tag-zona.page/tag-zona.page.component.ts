import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonMenuButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, arrowForwardOutline, barcodeOutline, listOutline, lockClosedOutline } from 'ionicons/icons';
import { EventoFacade } from '../../../state/evento/evento.facade';
import { Zona, ZonaFacade } from '../../../state/zona/zona.facade';
import { AuthFacade } from '../../../state/auth/auth.facade';
import { ConteoListFacade } from '../../../state/conteo/conteo-list.facade';
import { stripEmojis } from '../../../shared/utils/text.utils';

/*
 * Pantalla previa al conteo: se ingresa/escanea el TAG y se elige la zona, y
 * desde acá se pasa a contar. Separada de la pantalla de conteo para que el
 * operador pueda ir al resumen entre un TAG y el siguiente, sin mezclarse con
 * el escaneo.
 *
 * No dirige al operador a un TAG concreto, tampoco en reconteo: la muestra de
 * la iteración define QUÉ SKUs son válidos, pero dónde están se descubre en
 * terreno (un SKU puede estar en varios TAG, aparecer uno nuevo, caerse una
 * etiqueta). Para saber dónde se contó algo está el buscador SKU del menú.
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
    IonMenuButton,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class TagZonaPageComponent implements ViewWillEnter {
  @ViewChild('zonaSelect') zonaSelect!: IonSelect;
  @ViewChild('tagInputEl') tagInputEl!: ElementRef<HTMLIonInputElement>;

  private router          = inject(Router);
  private alertController = inject(AlertController);
  private eventoFacade    = inject(EventoFacade);
  private auth            = inject(AuthFacade);
  private zonaFacade      = inject(ZonaFacade);
  private conteoList      = inject(ConteoListFacade);

  currentEvent    = this.eventoFacade.selectedEvent;
  iteracionActual = this.conteoList.iteracionActiva;

  tagInputValue = signal('');
  tagError      = signal<string | null>(null);

  zonas             = this.zonaFacade.zones;
  private tagLocked = signal(false);
  tagConfirmado     = computed(() => this.tagLocked() ? this.zonaFacade.tagValue() : null);
  zonaConfirmada    = this.zonaFacade.selectedZone;
  errorZona         = this.zonaFacade.error;

  tagsSugeridos       = this.conteoList.tagsReconteo;
  tagsSugeridosLoading = this.conteoList.tagsReconteoLoading;

  constructor() {
    addIcons({ alertCircleOutline, arrowForwardOutline, barcodeOutline, listOutline, lockClosedOutline });
  }

  /*
   * Las zonas se cargan en cada entrada, no en el constructor: ion-router-outlet
   * puede reutilizar la página, y el evento (o su iteración) pudo cambiar desde
   * la última vez que se estuvo acá.
   */
  async ionViewWillEnter(): Promise<void> {
    await this.eventoFacade.refreshSelected();

    // Si el evento cambió a EN_ANALISIS o CERRADO (ej: desde otra PDA), redirigir a home
    if (this.currentEvent()?.estado === 'EN_ANALISIS' || this.currentEvent()?.estado === 'CERRADO') {
      this.router.navigate(['/home']);
      return;
    }

    this.cargarZonas();
    void this.cargarTagsSugeridos();
  }

  private async cargarTagsSugeridos(): Promise<void> {
    const evento = this.currentEvent();
    if (!evento) return;
    // La ronda hay que resolverla antes: los TAGs sugeridos son los de rondas anteriores.
    const iteracion = await this.conteoList.cargarIteracionActiva(evento.id);
    await this.conteoList.cargarTagsReconteo(evento.id, iteracion);
  }

  /*
   * Las zonas salen de la tienda del evento, no de una asignación por operador:
   * dentro del evento asignado, el operador elige en cuál trabajar.
   */
  private cargarZonas(): void {
    const evento = this.currentEvent();
    if (evento) {
      void this.zonaFacade.loadZonas(evento.sucursalId);
    }
  }

  onTagInput(event: Event): void {
    const value = (event as CustomEvent<{ value: string | null }>).detail.value ?? '';
    this.tagInputValue.set(stripEmojis(value));
  }

  // Solo confirma el TAG en memoria — el registro real en sod_ubicacion ocurre
  // recién al "Ir a contar" (confirmZona), junto con la zona.
  // Si el TAG no está en la lista de sugeridos (iteraciones anteriores), se
  // pide confirmación al operador antes de continuar.
  async confirmarTag(): Promise<void> {
    const value = this.tagInputValue().trim().toUpperCase();
    if (!value) return;

    // Si es reconteo (iteración > 1) y el TAG no fue contado antes, confirmar
    if (this.iteracionActual() > 1 && !this.conteoList.esTagSugerido(value)) {
      const confirm = await this.alertController.create({
        header: 'TAG no registrado en iteraciones anteriores',
        message: `El TAG ${value} no fue contado en iteraciones anteriores de este evento.\n\n¿Deseas continuar con este TAG?`,
        buttons: [
          { text: 'Cancelar', role: 'cancel', handler: () => { this.tagInputValue.set(''); } },
          { text: 'Continuar', role: 'confirm', handler: () => { this.confirmarTagSinValidar(value); } },
        ],
      });
      await confirm.present();
      return;
    }

    this.confirmarTagSinValidar(value);
  }

  private confirmarTagSinValidar(value: string): void {
    this.tagError.set(null);
    this.tagInputValue.set('');
    this.zonaFacade.setTag(value);
    this.tagLocked.set(true);
    requestAnimationFrame(() => this.zonaSelect?.open());
  }

  // Atajo: toca un chip de TAG sugerido y lo confirma directamente
  seleccionarTagSugerido(tag: string): void {
    if (this.tagLocked()) return;
    this.zonaFacade.setTag(tag);
    this.tagLocked.set(true);
    requestAnimationFrame(() => this.zonaSelect?.open());
  }

  onZonaChange(event: Event): void {
    const zona = (event as CustomEvent<{ value: Zona | null }>).detail.value;
    if (zona) this.zonaFacade.selectZona(zona);
  }

  cancelarTag(): void {
    this.tagLocked.set(false);
    this.zonaFacade.reset();
    this.tagInputValue.set('');
    this.tagError.set(null);
    this.cargarZonas();
    setTimeout(() => this.tagInputEl?.nativeElement?.setFocus?.(), 80);
  }

  async irAContar(): Promise<void> {
    if (!this.tagConfirmado() || !this.zonaConfirmada()) return;
    await this.zonaFacade.confirmZona();
    if (this.zonaFacade.error()) return;
    this.router.navigate(['/counting']);
  }

  goToResumen(): void {
    this.router.navigate(['/tags-resumen']);
  }
}
