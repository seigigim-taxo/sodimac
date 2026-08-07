import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import {
  AlertController,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonButtons,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, businessOutline, lockClosedOutline, hourglassOutline, syncOutline } from 'ionicons/icons';
import { AuthFacade } from '../../state/auth/auth.facade';
import { PdaFacade } from '../../state/pda/pda.facade';
import { SucursalFacade } from '../../state/sucursal/sucursal.facade';
import { EventoFacade, Evento } from '../../state/evento/evento.facade';
import { ConteoListFacade } from '../../state/conteo/conteo-list.facade';
import { ResumenEventoFacade } from '../../state/conteo/resumen-evento.facade';
import { ResultadoAbrirIteracion } from '../../application/conteo/abrir-siguiente-iteracion.use-case';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonMenuButton,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class HomePage implements ViewWillEnter {
  private router          = inject(Router);
  private auth             = inject(AuthFacade);
  private sucursalFacade  = inject(SucursalFacade);
  private eventoFacade    = inject(EventoFacade);
  private conteoList      = inject(ConteoListFacade);
  private alertController = inject(AlertController);
  private pda                = inject(PdaFacade);
  private resumenFacade      = inject(ResumenEventoFacade);

  /*
   * Cerrar la tienda exige que no quede trabajo sin subir: ni conteos abiertos
   * ni finalizados pendientes de sincronizar. Se deriva de sod_conteo, no de un
   * estado aparte.
   */
  puedeCerrarTienda = computed(() =>
    this.conteoList.conteos().every((c) => c.estado === 'SINCRONIZADO')
  );
  sincronizando = signal(false);
  // Timeout de sincronización: después de 30s sin respuesta del SGO, se activa
  // para permitir al operador reintentar.
  sincronizandoTimeout = signal(false);
  private sincronizandoTimeoutId: ReturnType<typeof setTimeout> | undefined;

  // Eventos ya cerrados/en análisis, con su resumen calculado en vivo: no se
  // guarda un snapshot del cierre, se reconstruye desde sod_conteo.
  eventosFinalizados = this.resumenFacade.cerrados;

  currentStore  = this.sucursalFacade.currentStore;
  storeLoading  = this.sucursalFacade.loading;
  storeError    = this.sucursalFacade.error;
  noStores      = this.sucursalFacade.noStores;

  private todosLosEventos = this.eventoFacade.events;

  /*
   * Un inventario con reconteo deja varios eventos con la misma fecha —uno por
   * ronda—, y al operador solo le sirve el último: los anteriores quedaron
   * EN_ANALISIS y ni siquiera son seleccionables. Se muestra el más reciente de
   * cada fecha.
   *
   * Se agrupa por fecha y no "el último de todos" porque dos fechas distintas
   * son dos inventarios distintos, y esos sí tienen que verse los dos.
   */
  events = computed(() => {
    const vistas = new Set<string>();
    // La lista ya viene ordenada por fecha DESC, id DESC: el primero de cada
    // fecha es el activo.
    return this.todosLosEventos().filter((e) => {
      const fecha = e.fechaProgramada.slice(0, 10);
      if (vistas.has(fecha)) return false;
      vistas.add(fecha);
      return true;
    });
  });

  selectedEvent = this.eventoFacade.selectedEvent;
  // El rótulo del botón sale del estado del evento, no de la iteración: RECONTEO
  // es exactamente "este evento va en una ronda posterior a la primera".
  esReconteo = computed(() => this.selectedEvent()?.estado === 'RECONTEO');
  eventsLoading = this.eventoFacade.loading;
  eventsError   = this.eventoFacade.error;
  hasEvents     = this.eventoFacade.hasEvents;
  noEvents      = this.eventoFacade.noEvents;

  constructor() {
    addIcons({ alertCircleOutline, businessOutline, lockClosedOutline, hourglassOutline, syncOutline });

    // En cuanto haya tienda cargada, pide sus eventos.
    effect(() => {
      const store = this.currentStore();
      if (store) void this.eventoFacade.loadEventos(store.id);
    });

    // Cada vez que cambia la lista de eventos, recalcula el resumen de los
    // que ya quedaron CERRADO/EN_ANALISIS por el flujo real de conteo.
    effect(() => {
      this.cargarEventosFinalizados(this.events());
    });
  }

  private cargarEventosFinalizados(eventos: Evento[]): void {
    const operadorId = this.auth.session()?.operadorId;
    const pdaId      = this.pda.pdaId();
    if (!operadorId || !pdaId) return;

    void this.resumenFacade.cargarCerrados(eventos, operadorId, pdaId);
  }

  ionViewWillEnter(): void {
    const session = this.auth.session();
    if (!session) return;
    void this.sucursalFacade.loadSucursales(session.operadorId);

    const pdaId = this.pda.pdaId();
    if (pdaId) void this.conteoList.load(session.operadorId, pdaId);
  }

  // Compara solo la fecha (YYYY-MM-DD), ignorando la hora — un evento de "hoy" siempre es seleccionable.
  esVencido(evento: Evento): boolean {
    const hoy = new Date().toISOString().slice(0, 10);
    return evento.fechaProgramada.slice(0, 10) < hoy;
  }

  esCerrado(evento: Evento): boolean {
    return evento.estado === 'CERRADO';
  }

  puedeSeleccionar(evento: Evento): boolean {
    // No se puede seleccionar un evento vencido, cerrado o en análisis
    // (en análisis = PDA bloqueada esperando respuesta del SGO)
    if (this.esVencido(evento) || this.esCerrado(evento) || this.enAnalisis(evento)) {
      return false;
    }
    // Si ya hay un evento seleccionado y es diferente, no permitir cambiar
    const actual = this.selectedEvent();
    if (actual && actual.id !== evento.id) {
      return false;
    }
    return true;
  }

  private static readonly ESTADO_LABELS: Record<Evento['estado'], string> = {
    ABIERTO:     'Abierto',
    EN_ANALISIS: 'En análisis',
    RECONTEO:    'Reconteo',
    CERRADO:     'Cerrado',
  };

  estadoEfectivoLabel(evento: Evento): string {
    return HomePage.ESTADO_LABELS[evento.estado];
  }

  enAnalisis(evento: Evento): boolean {
    return evento.estado === 'EN_ANALISIS';
  }

  selectEvento(evento: Evento): void {
    if (!this.puedeSeleccionar(evento)) return;
    this.eventoFacade.selectEvento(evento);
  }

  continue(): void {
    if (!this.selectedEvent()) return;
    this.router.navigate(['/counting-tag']);
  }

  async sincronizar(): Promise<void> {
    const evento = this.selectedEvent();
    if (!evento) return;

    this.sincronizando.set(true);
    this.sincronizandoTimeout.set(false);

    // Inicia timeout de 30s: si el SGO no responde, se activa para reintentar
    this.sincronizandoTimeoutId = setTimeout(() => {
      this.sincronizandoTimeout.set(true);
      this.sincronizando.set(false);
    }, 30000);

    try {
      // Simula la espera de respuesta del SGO
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // El evento quedó EN_ANALISIS al cerrar el conteo: abrir la ronda siguiente
      // prepara su muestra y deja el evento en RECONTEO.
      const resultado = await this.eventoFacade.abrirSiguienteIteracion();

      // Cancela el timeout si ya obtuvo respuesta
      if (this.sincronizandoTimeoutId) {
        clearTimeout(this.sincronizandoTimeoutId);
        this.sincronizandoTimeoutId = undefined;
      }

      this.sincronizando.set(false);
      this.sincronizandoTimeout.set(false);
      await this.avisarIteracionAbierta(resultado);
    } catch (err) {
      // Si hay error, también cancela el timeout
      if (this.sincronizandoTimeoutId) {
        clearTimeout(this.sincronizandoTimeoutId);
        this.sincronizandoTimeoutId = undefined;
      }
      this.sincronizando.set(false);
      this.sincronizandoTimeout.set(false);
    }
  }

  reintentarSincronizacion(): void {
    // Reset del timeout y reintentar
    this.sincronizandoTimeout.set(false);
    void this.sincronizar();
  }

  private async avisarIteracionAbierta(resultado: ResultadoAbrirIteracion | null): Promise<void> {
    if (resultado === null) {
      const alert = await this.alertController.create({
        header:  'No se pudo abrir la iteración',
        message: this.eventsError() ?? 'No se pudo abrir la iteración siguiente.',
        buttons: ['Entendido'],
      });
      await alert.present();
      return;
    }

    // Sin muestra la ronda queda abierta pero vacía: hay que decirlo, si no el
    // operador entra a contar y no encuentra ningún SKU válido.
    const alert = await this.alertController.create({
      header:  'Iteración abierta',
      message: resultado.conMuestra
        ? `Vas a trabajar en la iteración ${resultado.iteracion}.\n\n⚠ Las iteraciones anteriores quedaron cerradas definitivamente.\n\nNo se pueden editar, solo consultar como referencia.`
        : `Se abrió la iteración ${resultado.iteracion}, pero no hay diferencias que recontar.`,
      buttons: ['Entendido'],
    });
    await alert.present();
  }

  async cerrarTienda(): Promise<void> {
    if (!this.puedeCerrarTienda()) return;

    const alert = await this.alertController.create({
      header:  'Cerrar tienda',
      message: 'Esto finalizará tu jornada en esta tienda y cerrará tu sesión. ¿Confirmas?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Cerrar tienda', role: 'destructive', handler: () => { void this.doCerrarTienda(); } },
      ],
    });
    await alert.present();
  }

  private async doCerrarTienda(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }
}
