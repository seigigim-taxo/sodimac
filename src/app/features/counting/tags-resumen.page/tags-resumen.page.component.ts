import { Component, inject, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonLabel,
  IonMenuButton,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline, checkmarkDoneOutline, cloudDoneOutline, cloudUploadOutline,
  createOutline, refreshOutline, searchOutline, timeOutline, trashOutline,
} from 'ionicons/icons';
import { AuthFacade } from '../../../state/auth/auth.facade';
import { PdaFacade } from '../../../state/pda/pda.facade';
import { EventoFacade } from '../../../state/evento/evento.facade';
import { ConteoListFacade, ConteoResumen } from '../../../state/conteo/conteo-list.facade';
import { ResumenEventoFacade } from '../../../state/conteo/resumen-evento.facade';
import { SesionTrabajoFacade } from '../../../state/sesion-trabajo/sesion-trabajo.facade';
import { ConteoTrazabilidadItem } from '../../../domain/conteo/models/conteo-trazabilidad-item.model';
import { BuscadorService } from '../../../shared/services/buscador.service';
import { NetworkService } from '../../../shared/services/network.service';

/*
 * Resumen de los conteos del evento, agrupados por ubicación y estado
 * (EN_CURSO / FINALIZADO / SINCRONIZADO), leídos de sod_conteo. Las pestañas
 * separan las iteraciones cuando hay más de una.
 *
 * Desde acá también se cierra el conteo del evento, que es lo que lo deja
 * EN_ANALISIS o CERRADO.
 */
@Component({
  selector: 'app-tags-resumen',
  templateUrl: './tags-resumen.page.component.html',
  standalone: true,
  imports: [
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonMenuButton,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class TagsResumenPageComponent implements ViewWillEnter {
  private router = inject(Router);
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);

  // CONTEO (real)
  private auth = inject(AuthFacade);
  private pda = inject(PdaFacade);
  private eventoFacade = inject(EventoFacade);
  private conteoList = inject(ConteoListFacade);
  private resumenFacade = inject(ResumenEventoFacade);
  private sesionTrabajo = inject(SesionTrabajoFacade);
  private buscador = inject(BuscadorService);
  private network = inject(NetworkService);

  isOnline = this.network.isOnline;

  currentEvent = this.eventoFacade.selectedEvent;
  // Ronda activa derivada de sod_conteo, no la pestaña que el usuario esté mirando.
  iteracionActual = this.conteoList.iteracionActiva;

  resumenAvanceGlobal = this.resumenFacade.avance;
  resumenesEvento = computed(() => {
    const evento = this.currentEvent();
    if (!evento) return [];
    return this.conteoList.conteos().filter((c) => c.eventoId === evento.id);
  });
  // Pestañas por iteración — normalmente hay una sola mientras no exista reconteo real.
  iteracionesReales = computed(() => {
    const set = new Set(this.resumenesEvento().map((c) => c.iteracion));
    return [...set].sort((a, b) => b - a);
  });
  private iteracionSeleccionadaSignal = signal<number | null>(null);
  iteracionSeleccionada = computed(() => this.iteracionSeleccionadaSignal() ?? this.iteracionesReales()[0] ?? null);
  resumenesIteracionActual = computed(() => {
    const it = this.iteracionSeleccionada();
    return it === null ? [] : this.resumenesEvento().filter((c) => c.iteracion === it);
  });

  /*
   * Buscador de TAG. Las pestañas se recorren en horizontal y una jornada deja
   * decenas: sin filtro hay que arrastrar a ojo hasta encontrar el número.
   *
   * Filtra por coincidencia parcial y no exacta — el operador recuerda "el
   * cincuenta y algo" más seguido que el número completo.
   */
  busquedaTag = signal('');

  conteosComoPestanas = computed(() => {
    const q = this.busquedaTag().trim().toUpperCase();
    const base = this.resumenesIteracionActual();
    if (!q) return base;
    return base.filter((c) => (c.tag ?? '').toUpperCase().includes(q));
  });

  onBusquedaTagInput(event: Event): void {
    const value = (event as CustomEvent<{ value: string | null }>).detail.value ?? '';
    this.busquedaTag.set(value);
  }

  limpiarBusquedaTag(): void {
    this.busquedaTag.set('');
  }

  private conteoSeleccionadoSignal = signal<ConteoResumen | null>(null);
  conteoSeleccionado = computed(() => {
    const explicito = this.conteoSeleccionadoSignal();
    if (explicito) return explicito;
    const conteos = this.conteosComoPestanas();
    return conteos.length > 0 ? conteos[0] : null;
  });

  // Resumen global de la iteración actual
  resumenGlobalIteracion = computed(() => {
    const conteos = this.resumenesIteracionActual();
    if (conteos.length === 0) return null;

    const totalUnidades = conteos.reduce((sum, c) => sum + c.totalUnidades, 0);
    const totalProductos = conteos.reduce((sum, c) => sum + c.totalProductos, 0);
    const tagsFinalizados = conteos.filter((c) => c.estado === 'FINALIZADO' || c.estado === 'SINCRONIZADO').length;

    return {
      totalUnidades,
      totalProductos,
      tagsFinalizados,
      totalTags: conteos.length,
    };
  });

  // Modo solo lectura: cuando el evento está en EN_ANALISIS, no se permiten acciones destructivas
  modoSoloLectura = computed(() => {
    const estado = this.currentEvent()?.estado;
    return estado === 'EN_ANALISIS';
  });

  enCursoReal = computed(() => this.resumenesIteracionActual().filter((c) => c.estado === 'EN_CURSO'));
  finalizadosReal = computed(() => this.resumenesIteracionActual().filter((c) => c.estado === 'FINALIZADO'));
  sincronizadosReal = computed(() => this.resumenesIteracionActual().filter((c) => c.estado === 'SINCRONIZADO'));
  /*
   * El conteo del evento ya se cerró: quedó EN_ANALISIS (faltaron SKUs) o
   * CERRADO. En ambos casos esta pantalla pasa a ser de solo lectura — no se
   * puede volver a finalizar lo que ya está finalizado.
   */
  conteoCerrado = computed(() => {
    const estado = this.currentEvent()?.estado;
    return estado === 'EN_ANALISIS' || estado === 'CERRADO';
  });
  estadoEventoLabel = computed(() =>
    this.currentEvent()?.estado === 'CERRADO' ? 'Conteo cerrado' : 'Conteo cerrado — evento en análisis'
  );

  // No se puede cerrar el evento con algún TAG todavía en curso.
  puedeFinalizarEvento = computed(() =>
    !this.conteoCerrado() &&
    this.resumenesEvento().length > 0 &&
    this.resumenesEvento().every((c) => c.estado !== 'EN_CURSO')
  );
  finalizandoEvento = this.resumenFacade.finalizando;

  // ── trazabilidad (detalle por SKU) ──
  trazabilidadCompleta = this.resumenFacade.trazabilidad;
  trazabilidadLoading  = this.resumenFacade.trazabilidadLoading;
  trazabilidadFiltrada = computed(() => {
    const it = this.iteracionSeleccionada();
    return it === null ? [] : this.trazabilidadCompleta().filter((t) => t.iteracion === it);
  });

  /*
   * El detalle por SKU se renderizaba entero: con una muestra grande son
   * cientos de filas de una tabla que además hace scroll horizontal. Se pagina
   * de a 5, el mismo tamaño que la lista de productos de la pantalla de conteo,
   * para que el operador no encuentre dos comportamientos distintos.
   */
  private readonly PAGE_SIZE = 5;
  private visiblesTrazabilidad = signal(this.PAGE_SIZE);

  trazabilidadPaginada = computed(() =>
    this.trazabilidadFiltrada().slice(0, this.visiblesTrazabilidad())
  );
  hayMasTrazabilidad = computed(() =>
    this.trazabilidadFiltrada().length > this.visiblesTrazabilidad()
  );

  verMasTrazabilidad(): void {
    this.visiblesTrazabilidad.update((v) => v + this.PAGE_SIZE);
  }


  isSyncing(c: ConteoResumen): boolean {
    return this.conteoList.isSyncing(c);
  }


  constructor() {
    addIcons({
      alertCircleOutline, checkmarkDoneOutline, cloudDoneOutline, cloudUploadOutline,
      createOutline, refreshOutline, searchOutline, timeOutline, trashOutline,
    });
  }

  abrirBuscador(): void {
    this.buscador.abrir();
  }

  /*
   * La carga va acá y no en el constructor: ion-router-outlet mantiene las
   * páginas vivas en el stack de navegación, así que al volver desde Home el
   * componente se reutiliza y el constructor NO se vuelve a ejecutar — la
   * pantalla quedaba mostrando lo que había cargado la primera vez.
   * ionViewWillEnter sí corre en cada entrada, incluida la primera.
   */
  async ionViewWillEnter(): Promise<void> {
    // El estado del evento pudo cambiar fuera de esta pantalla (se cerró el
    // conteo, se abrió una iteración): sin releerlo se decide con datos viejos.
    await this.eventoFacade.refreshSelected();

    // A esta pantalla se puede llegar directo desde el menú, sin pasar por
    // TAG+zona: la ronda hay que resolverla acá también.
    const evento = this.currentEvent();
    if (evento) await this.conteoList.cargarIteracionActiva(evento.id);
    this.cargarResumenReal();
    await this.cargarResumenAvance();
    await this.cargarTrazabilidad();
  }

  private cargarResumenReal(): void {
    const operadorId = this.auth.session()?.operadorId;
    const pdaId = this.pda.pdaId();
    if (operadorId && pdaId) {
      void this.conteoList.load(operadorId, pdaId);
    }
  }

  private async cargarResumenAvance(): Promise<void> {
    const evento = this.currentEvent();
    const operadorId = this.auth.session()?.operadorId;
    const pdaId = this.pda.pdaId();
    if (evento && operadorId && pdaId) {
      await this.resumenFacade.cargarAvance(evento.id, operadorId, pdaId);
    }
  }

  private async cargarTrazabilidad(): Promise<void> {
    const evento = this.currentEvent();
    const operadorId = this.auth.session()?.operadorId;
    const pdaId = this.pda.pdaId();
    if (evento && operadorId && pdaId) {
      await this.resumenFacade.cargarTrazabilidad(evento.id, operadorId, pdaId);
    }
  }

  /*
   * El detalle por SKU vive en su propio signal y lee sod_conteo_detalle: al
   * sincronizar cambia el estado de esas filas en la base, pero el signal no se
   * entera y seguía mostrando "pendiente" hasta salir y volver a la pantalla.
   * Por eso se recarga acá y no solo la lista de TAGs.
   */
  async sincronizarReal(c: ConteoResumen): Promise<void> {
    const sincronizado = await this.conteoList.sincronizar(c);

    if (!sincronizado) {
      await this.avisar(
        this.conteoList.error() ?? 'No se pudo sincronizar el TAG. Queda pendiente.',
        'danger'
      );
      return;
    }

    await this.cargarTrazabilidad();
    await this.avisar(`TAG ${c.tag ?? ''} sincronizado.`.replace('  ', ' '), 'success');
  }

  /*
   * Reabre el TAG y lleva al operador de vuelta a la pantalla de conteo, con lo
   * que ya había contado.
   *
   * Se exige que no haya otro TAG en curso: solo se cuenta un TAG a la vez, y
   * además la restauración de sesión resuelve "el TAG abierto más reciente" —
   * con dos abiertos podría llevar al que no es.
   */
  async editarReal(c: ConteoResumen): Promise<void> {
    const operadorId = this.auth.session()?.operadorId;
    const pdaId      = this.pda.pdaId();
    if (!operadorId || !pdaId) return;

    if (this.conteoList.conteos().some((otro) => otro.estado === 'EN_CURSO')) {
      await this.avisar('Termina el TAG que tienes en curso antes de reabrir otro.', 'danger');
      return;
    }

    const reabierto = await this.conteoList.reabrir(c);
    if (!reabierto) {
      await this.avisar(this.conteoList.error() ?? 'No se pudo reabrir el TAG.', 'danger');
      return;
    }

    await this.sesionTrabajo.restaurar(operadorId, pdaId);
    this.router.navigate(['/counting']);
  }

  async eliminarReal(c: ConteoResumen): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Eliminar conteo',
      message: `¿Eliminar el conteo del TAG ${c.tag} (${c.zonaCodigo})?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          // Mismo motivo que en sincronizarReal: borrar las líneas deja el
          // detalle por SKU mostrando productos que ya no existen.
          handler: () => { void this.conteoList.delete(c).then(() => this.cargarTrazabilidad()); },
        },
      ],
    });
    await alert.present();
  }

  async finalizarEventoReal(): Promise<void> {
    if (!this.puedeFinalizarEvento()) return;
    const evento = this.currentEvent();
    const operadorId = this.auth.session()?.operadorId;
    const pdaId = this.pda.pdaId();
    if (!evento || !operadorId || !pdaId) return;

    const alert = await this.alertController.create({
      header: 'Finalizar conteo',
      message: 'Vas a cerrar el conteo de este evento. Esta acción no se puede deshacer. ¿Confirmas?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Finalizar', role: 'confirm', handler: () => { void this.doFinalizarEventoReal(evento.id, operadorId, pdaId); } },
      ],
    });
    await alert.present();
  }

  private async doFinalizarEventoReal(eventoId: number, operadorId: number, pdaId: number): Promise<void> {
    const resultado = await this.resumenFacade.finalizarEvento(eventoId, operadorId, pdaId);

    if (!resultado) {
      await this.avisar(this.resumenFacade.error() ?? 'Error al finalizar el conteo', 'danger');
      return;
    }

    // El evento cambió de estado en base: sin releerlo, Home y esta misma
    // pantalla seguirían tratándolo como ABIERTO (y Home no ofrecería
    // "Sincronizar" para abrir la iteración siguiente).
    await this.eventoFacade.refreshSelected();
    /*
     * No se informa si faltaron SKUs: el evento queda en análisis y es el SGO
     * quien evalúa el resultado y decide si hay otra iteración.
     */
    await this.avisar(
      `Conteo finalizado — ${resultado.contados} SKU(s) contados, evento en análisis`,
      'success'
    );
    this.router.navigate(['/home']);
  }

  private async avisar(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 3000, color, position: 'top' });
    await toast.present();
  }

  onIteracionChange(event: Event): void {
    const value = (event as CustomEvent<{ value: string | number }>).detail.value;
    this.iteracionSeleccionadaSignal.set(Number(value));
    // Al cambiar de iteración, resetear el conteo seleccionado
    this.conteoSeleccionadoSignal.set(null);
    // Y el paginado: el detalle que se muestra es otro, arrancar mostrando todo
    // lo ya expandido de la ronda anterior no tiene sentido.
    this.visiblesTrazabilidad.set(this.PAGE_SIZE);
  }

  onConteoChange(event: Event): void {
    const value = (event as CustomEvent<{ value: string | number }>).detail.value;
    const conteoId = Number(value);
    const conteo = this.conteosComoPestanas().find((c) => c.ubicacionId === conteoId);
    this.conteoSeleccionadoSignal.set(conteo ?? null);
  }
}
