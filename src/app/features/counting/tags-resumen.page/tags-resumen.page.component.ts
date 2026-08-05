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
  IonMenuButton,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline, checkmarkDoneOutline, cloudDoneOutline, cloudUploadOutline,
  createOutline, refreshOutline, timeOutline, trashOutline,
} from 'ionicons/icons';
import { AuthFacade } from '../../../state/auth/auth.facade';
import { PdaFacade } from '../../../state/pda/pda.facade';
import { EventoFacade } from '../../../state/evento/evento.facade';
import { ConteoListFacade, ConteoResumen } from '../../../state/conteo/conteo-list.facade';
import { ResumenEventoFacade } from '../../../state/conteo/resumen-evento.facade';

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

  // Pestañas por conteo individual (TAG)
  conteosComoPestanas = computed(() => this.resumenesIteracionActual());
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


  isSyncing(c: ConteoResumen): boolean {
    return this.conteoList.isSyncing(c);
  }


  constructor() {
    addIcons({
      alertCircleOutline, checkmarkDoneOutline, cloudDoneOutline, cloudUploadOutline,
      createOutline, refreshOutline, timeOutline, trashOutline,
    });

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

  async sincronizarReal(c: ConteoResumen): Promise<void> {
    await this.conteoList.sincronizar(c);
  }

  async eliminarReal(c: ConteoResumen): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Eliminar conteo',
      message: `¿Eliminar el conteo del TAG ${c.tag} (${c.zonaCodigo})?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => { void this.conteoList.delete(c); } },
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
    await this.avisar(
      resultado.faltantes > 0
        ? `Conteo finalizado — evento en análisis (${resultado.faltantes} SKU(s) sin contar)`
        : 'Conteo finalizado — evento cerrado',
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
  }

  onConteoChange(event: Event): void {
    const value = (event as CustomEvent<{ value: string | number }>).detail.value;
    const conteoId = Number(value);
    const conteo = this.conteosComoPestanas().find((c) => c.ubicacionId === conteoId);
    this.conteoSeleccionadoSignal.set(conteo ?? null);
  }
}
