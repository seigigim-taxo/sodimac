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
import { alertCircleOutline, businessOutline, chevronDownOutline, informationCircleOutline, syncOutline, searchOutline } from 'ionicons/icons';
import { AuthFacade } from '../../state/auth/auth.facade';
import { PdaFacade } from '../../state/pda/pda.facade';
import { SucursalFacade } from '../../state/sucursal/sucursal.facade';
import { EventoFacade, Evento } from '../../state/evento/evento.facade';
import { hoySql } from '../../shared/utils/fecha.utils';
import { ConteoListFacade } from '../../state/conteo/conteo-list.facade';
import { ResumenEventoFacade } from '../../state/conteo/resumen-evento.facade';
import { NuevoConteoFacade } from '../../state/asignacion/nuevo-conteo.facade';
import { pararseEnAsignacion } from '../../state/asignacion/pararse-en-asignacion.util';
import { BuscadorService } from '../../shared/services/buscador.service';
import { NetworkService } from '../../shared/services/network.service';
import { OfertaActualizacionService } from '../../shared/services/oferta-actualizacion.service';


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
  private network            = inject(NetworkService);
  private oferta             = inject(OfertaActualizacionService);

  isOnline = this.network.isOnline;

  /*
   * Version nueva para ofrecer. La consulta se dispara al entrar a esta
   * pantalla --ver ionViewWillEnter-- porque en Inicio nunca hay un TAG
   * abierto: la app se CIERRA para instalarse, y ofrecerlo a mitad de un
   * conteo seria ofrecerle al operador perder el hilo.
   */
  hayVersionNueva     = this.oferta.ofrecible;
  versionDisponible   = this.oferta.disponible;
  descargandoVersion  = this.oferta.descargando;
  porcentajeVersion   = this.oferta.porcentaje;

  ofrecerActualizacion(): void {
    void this.oferta.ofrecer();
  }

  descartarActualizacion(): void {
    this.oferta.descartar();
  }

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
  /*
   * El historial también se acota al día: la jornada empieza limpia y lo de
   * ayer ya no es asunto del operador. Sin esto, "conteos finalizados" iba
   * creciendo sin fin y mezclaba jornadas.
   */
  eventosFinalizados = computed(() => {
    const hoy = hoySql();
    return this.resumenFacade.cerrados()
      .filter((c) => c.evento.fechaProgramada.slice(0, 10) === hoy);
  });

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
  /*
   * Solo el evento del día en curso. Cada jornada la app arranca como si fuera
   * la primera: si quedó el evento de ayer en la base, no se ofrece.
   *
   * La comparación es contra la fecha LOCAL, no UTC — ver hoySql(). Con
   * toISOString() la PDA pasaba al día siguiente a las 20:00 hora Chile y el
   * evento del día desaparecía en plena jornada.
   */
  eventosVisibles = computed<Evento[]>(() => {
    const hoy = hoySql();
    const delDia = this.events().filter(
      (e) => e.estado === 'ABIERTO' && e.fechaProgramada.slice(0, 10) === hoy
    );
    if (delDia.length === 0) return [];
    return [delDia.reduce((masNuevo, e) => (e.id > masNuevo.id ? e : masNuevo))];
  });
  eventsLoading = this.eventoFacade.loading;
  eventsError   = this.eventoFacade.error;
  noEvents      = this.eventoFacade.noEvents;

  /*
   * Hoy no hay nada que contar.
   *
   * Existe porque entre noEvents() y eventosVisibles() quedaba un hueco: el
   * primero mira si la base tiene ALGÚN evento, el segundo filtra a los de HOY.
   * Con el evento de ayer todavía en la base y nada programado hoy, los dos
   * daban un resultado que no mostraba nada — el operador entraba y se
   * encontraba con la tarjeta de la tienda, un vacío y un botón gris, sin una
   * línea que le dijera qué pasaba.
   *
   * Cubre también la base recién preparada sin eventos, que antes salía como
   * píldora roja de error. No tener trabajo asignado no es un error.
   */
  sinTrabajoHoy = computed(() =>
    this.eventosVisibles().length === 0 &&
    !this.eventsLoading() &&
    !this.eventsError()
  );

  /*
   * Distingue "todavía no te asignaron" de "ya lo terminaste": si hay conteos
   * cerrados hoy, decirle que no tiene nada asignado sería mentirle. Los
   * finalizados se acotan al día, así que su sola presencia alcanza.
   */
  terminoElDeHoy = computed(() => this.eventosFinalizados().length > 0);

  constructor() {
    addIcons({ alertCircleOutline, businessOutline, chevronDownOutline, informationCircleOutline, syncOutline, searchOutline });

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
    /*
     * Se consulta por version nueva ACA y no en el arranque de la app: entrar a
     * Inicio es la senial de que el operador no esta contando. El servicio
     * espacia las consultas, asi que entrar y salir varias veces no le pega al
     * servidor cada vez.
     *
     * Sin await y sin catch: si falla, no se ofrece nada y listo. Una consulta
     * de version no puede demorar ni romper la carga de la pantalla.
     */
    void this.oferta.buscarEnSilencio();

    const session = this.auth.session();
    if (!session) return;
    void this.sucursalFacade.loadSucursales(session.operadorId);

    const pdaId = this.pda.pdaId();
    if (pdaId) void this.conteoList.load(session.operadorId, pdaId);
  }

  /*
   * Compara solo la fecha (YYYY-MM-DD), ignorando la hora — un evento de "hoy"
   * siempre es seleccionable.
   *
   * El "hoy" es el local de la PDA, no el UTC. Con toISOString() la PDA pasaba
   * al día siguiente a las 20:00 hora Chile (UTC−4) y el evento del día quedaba
   * marcado como vencido durante las últimas 4 horas del turno, justo cuando el
   * operador todavía estaba contando.
   */
  esVencido(evento: Evento): boolean {
    return evento.fechaProgramada.slice(0, 10) < hoySql();
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
    const session = this.auth.session();
    if (!session) return;

    const asignacion = await this.nuevoConteo.buscar(session);
    if (!asignacion) return;

    await pararseEnAsignacion(asignacion, this.sucursalFacade, this.eventoFacade, session.operadorId);

    /*
     * No se selecciona ni se navega: el operador elige su evento y decide
     * cuándo entrar a contar, igual que al empezar la jornada. El aviso está
     * para que no tenga que adivinar cuál de la lista es el nuevo.
     */
    this.avisoNuevoConteo.set(asignacion.nombre);
  }

}
