import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import {
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
import { alertCircleOutline, businessOutline, chevronDownOutline, hourglassOutline, syncOutline, searchOutline } from 'ionicons/icons';
import { AuthFacade } from '../../state/auth/auth.facade';
import { PdaFacade } from '../../state/pda/pda.facade';
import { SucursalFacade } from '../../state/sucursal/sucursal.facade';
import { EventoFacade, Evento } from '../../state/evento/evento.facade';
import { ConteoListFacade } from '../../state/conteo/conteo-list.facade';
import { ResumenEventoFacade } from '../../state/conteo/resumen-evento.facade';
import { NuevoConteoFacade } from '../../state/asignacion/nuevo-conteo.facade';
import { BuscadorService } from '../../shared/services/buscador.service';


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
  private pda                = inject(PdaFacade);
  private resumenFacade      = inject(ResumenEventoFacade);
  private nuevoConteo        = inject(NuevoConteoFacade);
  private buscador           = inject(BuscadorService);

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

  /*
   * Paginado del historial: crece una jornada tras otra y no cabe entero en la
   * pantalla de una PDA.
   *
   * Se ordena por id descendente, no por fecha: varios conteos del mismo día
   * comparten fecha programada, y sin este criterio "los 5 primeros" dependería
   * del orden en que la base los devuelva.
   */
  private static readonly FINALIZADOS_POR_PAGINA = 5;
  private finalizadosVisibles = signal(HomePage.FINALIZADOS_POR_PAGINA);

  private finalizadosOrdenados = computed(() =>
    [...this.eventosFinalizados()].sort((a, b) => b.evento.id - a.evento.id)
  );

  finalizadosPaginados = computed(() =>
    this.finalizadosOrdenados().slice(0, this.finalizadosVisibles())
  );

  hayMasFinalizados = computed(() =>
    this.finalizadosOrdenados().length > this.finalizadosVisibles()
  );

  verMasFinalizados(): void {
    this.finalizadosVisibles.update((v) => v + HomePage.FINALIZADOS_POR_PAGINA);
  }

  currentStore  = this.sucursalFacade.currentStore;
  storeLoading  = this.sucursalFacade.loading;
  storeError    = this.sucursalFacade.error;
  noStores      = this.sucursalFacade.noStores;

  events        = this.eventoFacade.events;
  selectedEvent = this.eventoFacade.selectedEvent;

  /*
   * Solo el conteo abierto. Es el único sobre el que el operador puede actuar:
   * los terminados quedan EN_ANALISIS y los vencidos no son seleccionables, así
   * que mostrarlos solo agrega ruido y tarjetas atenuadas que no responden.
   *
   * Si hubiera más de uno abierto, manda el más nuevo — el de id mayor.
   */
  eventosVisibles = computed<Evento[]>(() => {
    const abiertos = this.events().filter((e) => e.estado === 'ABIERTO');
    if (abiertos.length === 0) return [];
    return [abiertos.reduce((masNuevo, e) => (e.id > masNuevo.id ? e : masNuevo))];
  });
  eventsLoading = this.eventoFacade.loading;
  eventsError   = this.eventoFacade.error;
  noEvents      = this.eventoFacade.noEvents;

  constructor() {
    addIcons({ alertCircleOutline, businessOutline, chevronDownOutline, hourglassOutline, syncOutline, searchOutline });

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

  abrirBuscador(): void {
    this.buscador.abrir();
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

}
