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
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, arrowForwardOutline, barcodeOutline, listOutline, lockClosedOutline, searchOutline } from 'ionicons/icons';
import { EventoFacade } from '../../../state/evento/evento.facade';
import { ZonaFacade } from '../../../state/zona/zona.facade';
import { AuthFacade } from '../../../state/auth/auth.facade';
import { PdaFacade } from '../../../state/pda/pda.facade';
import { ConteoListFacade } from '../../../state/conteo/conteo-list.facade';
import { stripEmojis } from '../../../shared/utils/text.utils';
import { BuscadorService } from '../../../shared/services/buscador.service';
import { NetworkService } from '../../../shared/services/network.service';

/*
 * Pantalla previa al conteo: se ingresa/escanea el TAG, se ingresa la ubicación
 * precisa y desde acá se pasa a contar. Separada de la pantalla de conteo para
 * que el operador pueda ir al resumen entre un TAG y el siguiente, sin
 * mezclarse con el escaneo.
 *
 * La zona NO se elige: se deriva del número de TAG usando los rangos que la
 * tienda trae del WS. Se muestra igual, para que el operador pueda cachar que
 * tipeó mal el TAG antes de contar contra la zona equivocada.
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

  isOnline = this.network.isOnline;

  currentEvent    = this.eventoFacade.selectedEvent;
  iteracionActual = this.conteoList.iteracionActiva;

  tagInputValue = signal('');
  tagError      = signal<string | null>(null);

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
   * Las zonas salen de la tienda del evento, no de una asignación por operador.
   * Ya no se cargan para que elija: se cargan porque sus rangos son lo que
   * permite derivar la zona del TAG.
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

  /*
   * La zona ya no se elige: se deriva del número de TAG con los rangos que
   * vienen del WS. Por eso la validación de forma y la resolución de zona van
   * juntas — un TAG sin zona no es un TAG utilizable.
   */
  private validarTag(value: string): string | null {
    if (!value) return 'Ingresa o escanea un TAG.';
    if (!/^\d+$/.test(value)) return 'El TAG debe ser numérico.';
    if (Number(value) === 0) return 'El TAG no puede ser 0.';

    const resolucion = this.zonaFacade.aplicarZonaPorTag(value);

    /*
     * Los dos fallos se separan porque el operador tiene que hacer cosas
     * distintas: uno lo resuelve él corrigiendo el número, el otro no lo
     * resuelve reintentando y necesita que alguien arregle los datos.
     */
    if (resolucion.estado === 'SIN_RANGOS') {
      return 'Las zonas de esta tienda no tienen rangos de TAG configurados. Avisa a tu supervisor.';
    }
    if (resolucion.estado === 'SIN_COINCIDENCIA') {
      return `El TAG ${value} no pertenece a ninguna zona de esta tienda. Revisa el número.`;
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
          // Se suelta la zona que ya había derivado validarTag(): el TAG que la
          // originó quedó descartado.
          { text: 'Cancelar', role: 'cancel', handler: () => { this.tagInputValue.set(''); this.zonaFacade.clearZona(); } },
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
    /*
     * El foco pasa a la ubicación precisa, que es el único campo que le queda
     * por llenar. Antes lo hacía onZonaChange al elegir la zona; sin selector,
     * el salto tiene que salir de acá.
     */
    setTimeout(() => this.ubicacionInputEl?.nativeElement?.setFocus?.(), 80);
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

  /*
   * Cambiar el TAG suelta también la zona: era derivada de ese TAG, así que
   * dejarla puesta mostraría la zona del TAG anterior mientras se tipea otro.
   */
  cancelarTag(): void {
    this.tagLocked.set(false);
    this.zonaFacade.clearZona();
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
