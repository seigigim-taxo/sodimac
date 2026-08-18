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
import { NuevoConteoFacade } from '../../state/asignacion/nuevo-conteo.facade';


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
  private nuevoConteo        = inject(NuevoConteoFacade);

  /*
   * Cerrar la tienda exige que no quede trabajo sin subir: ni conteos abiertos
   * ni finalizados pendientes de sincronizar. Se deriva de sod_conteo, no de un
   * estado aparte.
   */
  puedeCerrarTienda = computed(() =>
    this.conteoList.conteos().every((c) => c.estado === 'SINCRONIZADO')
  );
  /*
   * Nombre del conteo recién asignado, para señalarlo en la lista. La PDA no
   * lo selecciona sola: elegir el evento es del operador.
   */
  avisoNuevoConteo = signal<string | null>(null);

  // Consulta de trabajo nuevo cuando el conteo del evento ya se finalizó.
  buscandoConteo = this.nuevoConteo.buscando;
  sinNovedad     = this.nuevoConteo.sinNovedad;
  errorAsignacion = this.nuevoConteo.error;

  // Eventos ya cerrados/en análisis, con su resumen calculado en vivo: no se
  // guarda un snapshot del cierre, se reconstruye desde sod_conteo.
  eventosFinalizados = this.resumenFacade.cerrados;

  currentStore  = this.sucursalFacade.currentStore;
  storeLoading  = this.sucursalFacade.loading;
  storeError    = this.sucursalFacade.error;
  noStores      = this.sucursalFacade.noStores;

  events        = this.eventoFacade.events;
  selectedEvent = this.eventoFacade.selectedEvent;

  /*
   * La lista se acota a dos: el conteo que se acaba de terminar y el que sigue.
   * Es lo único que el operador necesita decidir, y sin este corte los conteos
   * se acumulan jornada tras jornada hasta volver la pantalla inútil.
   *
   * Se ordenan por id y se toman los últimos: el más nuevo es siempre el de id
   * mayor, y ese orden deja al anterior arriba y al nuevo abajo, que es como se
   * leen.
   */
  private static readonly MAX_EVENTOS_VISIBLES = 2;
  eventosVisibles = computed(() =>
    [...this.events()]
      .sort((a, b) => a.id - b.id)
      .slice(-HomePage.MAX_EVENTOS_VISIBLES)
  );
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

    // El aviso de "sin novedad" es de un evento concreto: al cambiar, sobra.
    effect(() => {
      this.selectedEvent();
      this.nuevoConteo.limpiar();
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
    // Ya eligió: el aviso cumplió su función.
    this.avisoNuevoConteo.set(null);
  }

  continue(): void {
    if (!this.selectedEvent()) return;
    this.router.navigate(['/counting-tag']);
  }

  /*
   * El conteo del evento ya se finalizó y la PDA queda a la espera: acá se le
   * pregunta al SGO si hay trabajo nuevo, que puede ser de otra jornada.
   *
   * No reabre el conteo anterior. Un evento finalizado está cerrado; lo que
   * viene es otro evento con su propia muestra.
   */
  async buscarNuevoConteo(): Promise<void> {
    const tienda = this.currentStore();
    if (!tienda) return;

    const asignacion = await this.nuevoConteo.buscar(tienda.id, this.selectedEvent()?.id ?? null);
    if (!asignacion) return;

    /*
     * Se suelta el evento terminado antes de recargar. Sin esto el operador no
     * podría elegir el nuevo: puedeSeleccionar bloquea el cambio mientras haya
     * otro evento seleccionado.
     */
    await this.eventoFacade.limpiarSeleccion();
    await this.eventoFacade.loadEventos(tienda.id);

    /*
     * No se selecciona ni se navega: el operador elige su evento y decide
     * cuándo entrar a contar, igual que al empezar la jornada. El aviso está
     * para que no tenga que adivinar cuál de la lista es el nuevo.
     */
    this.avisoNuevoConteo.set(asignacion.nombre);
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
