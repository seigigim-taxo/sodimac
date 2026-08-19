<<<<<<< HEAD
import { Component, computed, inject } from '@angular/core';
=======
import { Component, computed, effect, inject, signal } from '@angular/core';
>>>>>>> feat/modo-analista-maqueta
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import {
  AlertController,
  IonButton,
  IonContent,
  IonHeader,
  IonMenuButton,
  IonButtons,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
<<<<<<< HEAD
import { ViewWillEnter } from '@ionic/angular';
import { ThemeFacade } from '../../state/theme/theme.facade';
import { CountingFacade } from '../../state/counting/counting.facade';
import { CountingSession } from '../../domain/counting/models/counting-session.model';
import { getStatusBadgeClass, getStatusLabel, formatDate } from '../../shared/utils/counting-status.utils';
=======
import { addIcons } from 'ionicons';
import { alertCircleOutline, businessOutline, lockClosedOutline, hourglassOutline, syncOutline } from 'ionicons/icons';
import { AuthFacade } from '../../state/auth/auth.facade';
import { PdaFacade } from '../../state/pda/pda.facade';
import { SucursalFacade } from '../../state/sucursal/sucursal.facade';
import { EventoFacade, Evento } from '../../state/evento/evento.facade';
import { ConteoListFacade } from '../../state/conteo/conteo-list.facade';
import { ResumenEventoFacade } from '../../state/conteo/resumen-evento.facade';
import { ResultadoAbrirIteracion } from '../../application/conteo/abrir-siguiente-iteracion.use-case';
import { GetUltimaRondaUseCase } from '../../application/conteo/get-ultima-ronda.use-case';

>>>>>>> feat/modo-analista-maqueta

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonMenuButton,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class HomePage implements ViewWillEnter {
<<<<<<< HEAD
  private router = inject(Router);
  private theme = inject(ThemeFacade);
  private countingFacade = inject(CountingFacade);

  isDark = this.theme.isDark;
  sessions = this.countingFacade.sessions;
  recentSessions = computed(() => this.sessions().slice(0, 2));
=======
  private router          = inject(Router);
  private auth             = inject(AuthFacade);
  private sucursalFacade  = inject(SucursalFacade);
  private eventoFacade    = inject(EventoFacade);
  private conteoList      = inject(ConteoListFacade);
  private alertController = inject(AlertController);
  private pda                = inject(PdaFacade);
  private resumenFacade      = inject(ResumenEventoFacade);
  private getUltimaRonda     = inject(GetUltimaRondaUseCase);

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
>>>>>>> feat/modo-analista-maqueta

  // Contador de intentos de sincronización con SGO para el evento seleccionado.
  // Se resetea al cambiar de evento. Fase 6: solo simulación.
  private intentosSgo = 0;
  private ultimoEventoSgoId: number | null = null;

  // Eventos ya cerrados/en análisis, con su resumen calculado en vivo: no se
  // guarda un snapshot del cierre, se reconstruye desde sod_conteo.
  eventosFinalizados = this.resumenFacade.cerrados;

  currentStore  = this.sucursalFacade.currentStore;
  storeLoading  = this.sucursalFacade.loading;
  storeError    = this.sucursalFacade.error;
  noStores      = this.sucursalFacade.noStores;

  events        = this.eventoFacade.events;
  selectedEvent = this.eventoFacade.selectedEvent;
  // El rótulo del botón sale del estado del evento, no de la iteración: RECONTEO
  // es exactamente "este evento va en una ronda posterior a la primera".
  esReconteo = computed(() => this.selectedEvent()?.estado === 'RECONTEO');
  eventsLoading = this.eventoFacade.loading;
  eventsError   = this.eventoFacade.error;
  hasEvents     = this.eventoFacade.hasEvents;
  noEvents      = this.eventoFacade.noEvents;

<<<<<<< HEAD
  getStatusBadgeClass = getStatusBadgeClass;
  getStatusLabel = getStatusLabel;
  formatDate = formatDate;

  ionViewWillEnter(): void {
    this.countingFacade.reload();
=======
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

    // Resetea el contador de intentos SGO cuando cambia el evento seleccionado.
    effect(() => {
      const ev = this.selectedEvent();
      if (ev && ev.id !== this.ultimoEventoSgoId) {
        this.intentosSgo = 0;
        this.ultimoEventoSgoId = ev.id;
      }
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
>>>>>>> feat/modo-analista-maqueta
  }

  continue(): void {
    if (!this.selectedEvent()) return;
    this.router.navigate(['/counting-tag']);
  }

<<<<<<< HEAD
  openSession(session?: CountingSession): void {
    if (session) {
      if (session.status === 'in-progress') {
        this.router.navigate(['/counting', session.id]);
        return;
      }
      this.router.navigate(['/counting-detail', session.id]);
    } else {
      this.router.navigate(['/counting-list']);
    }
  }

  async toggleTheme(): Promise<void> {
    await this.theme.toggle();
=======
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

      // Cancela el timeout antes de mostrar alertas
      if (this.sincronizandoTimeoutId) {
        clearTimeout(this.sincronizandoTimeoutId);
        this.sincronizandoTimeoutId = undefined;
      }

      this.sincronizando.set(false);
      this.sincronizandoTimeout.set(false);

      // Consultar última ronda para decidir si cerrar o abrir reconteo
      const ultimaRonda = await this.getUltimaRonda.execute(evento.id);

      if (ultimaRonda && ultimaRonda.iteracion >= 2) {
        // Ya hubo reconteo: SGO aprueba y cierra el evento
        const ok = await this.eventoFacade.cerrarSeleccionado();
        if (ok) {
          const alert = await this.alertController.create({
            header: 'Evento cerrado',
            message: 'El SGO aprobó el reconteo y cerró el evento.',
            buttons: ['Entendido'],
          });
          await alert.present();
        } else {
          const alert = await this.alertController.create({
            header: 'No se pudo cerrar el evento',
            message: this.eventsError() ?? 'No se pudo cerrar el evento.',
            buttons: ['Entendido'],
          });
          await alert.present();
        }
      } else {
        // Primera iteración: lógica actual de reconteo
        this.intentosSgo++;

        if (this.intentosSgo < 3) {
          const alert = await this.alertController.create({
            header:  'SGO sigue analizando',
            message: 'El SGO aún no entrega una decisión para este evento. Intenta nuevamente más tarde.',
            buttons: ['Entendido'],
          });
          await alert.present();
        } else {
          const resultado = await this.eventoFacade.abrirSiguienteIteracion();

          if (resultado) {
            const message = resultado.conMuestra
              ? `El SGO determinó que este evento requiere una nueva iteración de reconteo. Se abrió la iteración ${resultado.iteracion}.`
              : 'El SGO determinó reconteo, pero no hay SKUs disponibles para recontar.';
            const alert = await this.alertController.create({
              header: 'Reconteo requerido',
              message,
              buttons: ['Entendido'],
            });
            await alert.present();
          } else {
            const alert = await this.alertController.create({
              header: 'No se pudo abrir el reconteo',
              message: this.eventsError() ?? 'No se pudo abrir la iteración de reconteo.',
              buttons: ['Entendido'],
            });
            await alert.present();
          }
        }
      }
    } catch {
      if (this.sincronizandoTimeoutId) {
        clearTimeout(this.sincronizandoTimeoutId);
        this.sincronizandoTimeoutId = undefined;
      }
      this.sincronizando.set(false);
      this.sincronizandoTimeout.set(false);
    }
  }

  reintentarSincronizacion(): void {
    this.sincronizandoTimeout.set(false);
    void this.sincronizar();
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
>>>>>>> feat/modo-analista-maqueta
  }
}
