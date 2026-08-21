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
import { alertCircleOutline, arrowForwardOutline, barcodeOutline, listOutline, lockClosedOutline, searchOutline } from 'ionicons/icons';
import { EventoFacade } from '../../../state/evento/evento.facade';
import { Zona, ZonaFacade } from '../../../state/zona/zona.facade';
import { AuthFacade } from '../../../state/auth/auth.facade';
import { PdaFacade } from '../../../state/pda/pda.facade';
import { ConteoListFacade } from '../../../state/conteo/conteo-list.facade';
import { stripEmojis } from '../../../shared/utils/text.utils';
import { BuscadorService } from '../../../shared/services/buscador.service';
import { NetworkService } from '../../../shared/services/network.service';

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
  @ViewChild('tagInputEl') tagInputEl!: ElementRef<HTMLIonInputElement>;
  @ViewChild('ubicacionInputEl') ubicacionInputEl!: ElementRef<HTMLIonInputElement>;

  private router          = inject(Router);
  private alertController = inject(AlertController);
  private eventoFacade    = inject(EventoFacade);
  private auth            = inject(AuthFacade);
  private pda             = inject(PdaFacade);
  private zonaFacade      = inject(ZonaFacade);
  private conteoList      = inject(ConteoListFacade);
  private buscador        = inject(BuscadorService);
  private network         = inject(NetworkService);

  online = this.network.isOnline;

  currentEvent    = this.eventoFacade.selectedEvent;
  iteracionActual = this.conteoList.iteracionActiva;

  tagInputValue = signal('');
  tagError      = signal<string | null>(null);

  zonas             = this.zonaFacade.zones;
  private tagLocked = signal(false);
  tagConfirmado     = computed(() => this.tagLocked() ? this.zonaFacade.tagValue() : null);
  zonaConfirmada    = this.zonaFacade.selectedZone;
  ubicacionPrecisa  = this.zonaFacade.ubicacionPrecisa;
  errorZona         = this.zonaFacade.error;

  tagsSugeridos       = this.conteoList.tagsReconteo;
  tagsSugeridosLoading = this.conteoList.tagsReconteoLoading;

  hayConteosEvento = computed(() => {
    const evento = this.currentEvent();
    return !!evento && this.conteoList.conteos().some((c) => c.eventoId === evento.id);
  });

  constructor() {
    addIcons({ alertCircleOutline, arrowForwardOutline, barcodeOutline, listOutline, lockClosedOutline, searchOutline });
  }

  abrirBuscador(): void {
    this.buscador.abrir();
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
    void this.cargarConteos();
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

  private async cargarConteos(): Promise<void> {
    const operadorId = this.auth.session()?.operadorId;
    const pdaId = this.pda.pdaId();
    if (!operadorId || !pdaId) return;
    await this.conteoList.load(operadorId, pdaId);
  }

  onTagInput(event: Event): void {
    const value = (event as CustomEvent<{ value: string | null }>).detail.value ?? '';
    this.tagInputValue.set(stripEmojis(value));
  }

  onUbicacionInput(event: Event): void {
    const value = (event as CustomEvent<{ value: string | null }>).detail.value ?? '';
    this.zonaFacade.setUbicacionPrecisa(stripEmojis(value));
  }

  private validarTag(value: string): string | null {
    if (!value) return 'Ingresa o escanea un TAG.';
    if (!/^\d+$/.test(value)) return 'El TAG debe ser numérico.';
    if (Number(value) === 0) return 'El TAG no puede ser 0.';

    const zona = this.zonaConfirmada();
    if (zona && zona.tagDesde !== null && zona.tagHasta !== null) {
      const tagNumero = Number(value);
      if (tagNumero < zona.tagDesde || tagNumero > zona.tagHasta) {
        return `El TAG ${value} no corresponde a ${zona.descripcion || zona.nombre}. Rango permitido: ${zona.tagDesde} a ${zona.tagHasta}.`;
      }
    }

    return null;
  }

  async confirmarTag(): Promise<void> {
    const value = this.tagInputValue().trim().toUpperCase();
    const error = this.validarTag(value);
    if (error) {
      this.tagError.set(error);
      return;
    }

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
  }

  seleccionarTagSugerido(tag: string): void {
    if (this.tagLocked()) return;
    const value = tag.trim().toUpperCase();
    const error = this.validarTag(value);
    if (error) {
      this.tagError.set(error);
      return;
    }
    this.confirmarTagSinValidar(value);
  }

  onZonaChange(event: Event): void {
    const zona = (event as CustomEvent<{ value: Zona | null }>).detail.value;
    if (!zona) return;

    const zonaAnterior = this.zonaConfirmada();
    this.zonaFacade.selectZona(zona);

    if (zonaAnterior && zonaAnterior.id !== zona.id) {
      this.tagLocked.set(false);
      this.tagInputValue.set('');
      this.tagError.set(null);
      this.zonaFacade.clearUbicacionYTag();
    }

    setTimeout(() => this.ubicacionInputEl?.nativeElement?.setFocus?.(), 80);
  }

  onUbicacionKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      setTimeout(() => this.tagInputEl?.nativeElement?.setFocus?.(), 80);
    }
  }

  cancelarTag(): void {
    this.tagLocked.set(false);
    this.zonaFacade.clearTag();
    this.tagInputValue.set('');
    this.tagError.set(null);
    setTimeout(() => this.tagInputEl?.nativeElement?.setFocus?.(), 80);
  }

  async irAContar(): Promise<void> {
    if (!this.tagConfirmado() || !this.zonaConfirmada() || !this.ubicacionPrecisa().trim()) return;
    await this.zonaFacade.confirmZona();
    if (this.zonaFacade.error()) return;
    this.router.navigate(['/counting']);
  }

  goToResumen(): void {
    this.router.navigate(['/tags-resumen']);
  }
}
