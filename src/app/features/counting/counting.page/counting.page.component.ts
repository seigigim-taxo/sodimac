import { Component, inject, isDevMode, signal, computed, viewChild } from '@angular/core';
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
  addOutline, alertCircleOutline, chevronDownOutline, chevronUpOutline, closeCircleOutline, flagOutline, removeOutline, searchOutline, statsChartOutline, trashOutline,
} from 'ionicons/icons';
import { ScanComponent, CodigoCapturado } from '../../../shared/components/scan/scan.component';
import { MedioCaptura } from '../../../domain/conteo/models/medio-captura.model';
import { EventoFacade } from '../../../state/evento/evento.facade';
import { AuthFacade } from '../../../state/auth/auth.facade';
import { PdaFacade } from '../../../state/pda/pda.facade';
import { ZonaFacade } from '../../../state/zona/zona.facade';
import { ConteoFacade } from '../../../state/conteo/conteo.facade';
import { ConteoListFacade } from '../../../state/conteo/conteo-list.facade';
import { ResumenEventoFacade, ResumenEvento } from '../../../state/conteo/resumen-evento.facade';
import { AjustesFacade } from '../../../state/ajustes/ajustes.facade';
import { BuscadorService } from '../../../shared/services/buscador.service';
import { NetworkService } from '../../../shared/services/network.service';
import { AvisoSincronizacionService } from '../../../shared/services/aviso-sincronizacion.service';

/*
 * Pantalla de conteo (SKU + cantidad) del TAG/zona elegidos en la pantalla
 * anterior. Persiste contra sod_conteo vía ConteoFacade.
 *
 * No distingue conteo de reconteo: es el mismo trabajo. Lo que cambia entre
 * rondas es la MUESTRA (más acotada en un reconteo), y eso es un dato que llega
 * por sod_muestra de la iteración activa — no una variante de esta pantalla.
 */

interface ItemVista { productoId: number; sku: string; descripcion: string; cantidad: number; }

/*
 * Resultado del último escaneo, para el banner bajo el escáner:
 *  - OK                → registrado
 *  - FUERA_DE_MUESTRA  → el SKU no pertenece a la muestra de esta iteración
 *  - ERROR             → el SKU era válido pero la escritura falló; `mensaje`
 *                        trae el detalle real.
 */
interface ResultadoScan {
  sku: string;
  estado: 'OK' | 'FUERA_DE_MUESTRA' | 'ERROR';
  mensaje?: string;
}

/*
 * Cómo se cuenta el próximo SKU. Es una decisión por lectura, no una
 * configuración de la pantalla: el operador la cambia según el producto que
 * tenga delante.
 *
 *  - 'uno'      → una lectura suma una unidad y el foco vuelve al escáner.
 *  - 'cantidad' → la lectura solo captura el SKU; las unidades se tipean después
 *                 y recién ahí se registra.
 */
type ModoCaptura = 'uno' | 'cantidad';

@Component({
  selector: 'app-counting-page',
  templateUrl: './counting.page.component.html',
  standalone: true,
  imports: [
    ScanComponent,
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
  ],
})
export class CountingPageComponent implements ViewWillEnter {
  private router            = inject(Router);
  private alertController   = inject(AlertController);
  private toastController   = inject(ToastController);
  private eventoFacade      = inject(EventoFacade);
  private auth              = inject(AuthFacade);
  private pda               = inject(PdaFacade);
  private zonaFacade        = inject(ZonaFacade);
  private conteo            = inject(ConteoFacade);
  private conteoList        = inject(ConteoListFacade);
  private resumenFacade     = inject(ResumenEventoFacade);
  private ajustes           = inject(AjustesFacade);
  private buscador          = inject(BuscadorService);
  private network           = inject(NetworkService);
  private avisoSync         = inject(AvisoSincronizacionService);

  isOnline = this.network.isOnline;
  sesionCargando = this.conteo.loading;

  private scanComp      = viewChild(ScanComponent);
  private cantidadInput = viewChild<IonInput>('cantidadInput');

  modoCaptura = signal<ModoCaptura>('uno');
  /*
   * SKU leído en modo 'cantidad' que todavía espera las unidades, junto con
   * cómo entró. null = no hay captura abierta.
   *
   * El medio viaja con el código y no se recalcula al guardar: describe cómo
   * llegó el SKU, y eso ya ocurrió. Que la cantidad se tipee después no lo
   * cambia.
   */
  skuPendiente = signal<CodigoCapturado | null>(null);

  /*
   * A partir de acá se pregunta antes de escribir. Es un umbral de referencia
   * acordado con el cliente, no un límite del negocio: hay SKU que legítimamente
   * pasan de 2000 unidades.
   */
  readonly CANTIDAD_ALTA = 2000;

  // Aviso en la propia tarjeta, mientras tipea: llega antes que el diálogo del guardado.
  cantidadEsAlta = computed(() => this.cantidad() >= this.CANTIDAD_ALTA);

  /*
   * El escáner se bloquea siempre que no haya una sesión utilizable, no solo
   * mientras carga: si init() falla, `loading` vuelve a false igual y el
   * escáner quedaría aceptando lecturas contra nada.
   *
   * También mientras hay un SKU esperando cantidad: con pistola de teclado, un
   * segundo disparo pisaría el código a medio registrar sin que nadie lo note.
   */
  escanerBloqueado = computed(() =>
    this.sesionCargando() || !this.conteo.enCurso() || this.skuPendiente() !== null
  );

  /*
   * Falla al abrir la sesión. Se muestra como banner y no como toast porque no
   * se resuelve sola: el operador tiene que reintentar o salir.
   */
  errorSesion = computed(() =>
    !this.sesionCargando() && !this.conteo.enCurso() ? this.conteo.error() : null
  );

  currentEvent = this.eventoFacade.selectedEvent;
  tagActual    = this.zonaFacade.tagValue;
  zonaActual   = computed<{ nombre: string; descripcion: string | null } | null>(() => {
    const z = this.zonaFacade.selectedZone();
    return z ? { nombre: z.nombre, descripcion: z.descripcion } : null;
  });

  cantidad    = signal(1);
  busquedaSku = signal('');
  lastScan    = signal<ResultadoScan | null>(null);
  private lastScanTimeoutId: ReturnType<typeof setTimeout> | undefined;

  finalizando = signal(false);

  // Resumen de avance del evento: panel expandible que muestra el progreso global
  resumenVisible = signal(false);
  resumenEvento = signal<ResumenEvento | null>(null);
  resumenCargando = signal(false);

  itemsView = computed<ItemVista[]>(() => this.conteo.items().map((i) => ({
    productoId:  i.productoId,
    sku:         i.sku,
    descripcion: i.descripcion ?? i.sku,
    cantidad:    i.cantidadFisica,
  })));

  totalItems    = computed(() => this.itemsView().length);
  // Q contado del tag en curso: suma de unidades escaneadas, no cantidad de SKU distintos.
  totalUnidades = computed(() => this.itemsView().reduce((sum, i) => sum + i.cantidad, 0));

  // Filtra la lista de productos ya escaneados por SKU o descripción — no afecta el conteo, solo la vista.
  itemsFiltrados = computed(() => {
    const q = this.busquedaSku().trim().toUpperCase();
    const base = this.itemsView();
    if (!q) return base;
    return base.filter((i) => i.sku.includes(q) || i.descripcion.toUpperCase().includes(q));
  });

  // Paginado de la lista visible: arranca en 5 y crece de 5 en 5 con "Ver más".
  private readonly PAGE_SIZE = 5;
  visibleCount   = signal(this.PAGE_SIZE);
  itemsPaginados = computed(() => this.itemsFiltrados().slice(0, this.visibleCount()));
  hayMasItems    = computed(() => this.itemsFiltrados().length > this.visibleCount());

  verMasItems(): void {
    this.visibleCount.update((v) => v + this.PAGE_SIZE);
  }

  constructor() {
    addIcons({ addOutline, alertCircleOutline, chevronDownOutline, chevronUpOutline, closeCircleOutline, flagOutline, removeOutline, searchOutline, statsChartOutline, trashOutline });
  }

  abrirBuscador(): void {
    this.buscador.abrir();
  }

  private sesionInicializada: number | null = null;

  // Porcentaje de avance de la muestra: SKUs contados / total de la muestra * 100
  porcentajeAvance = computed(() => {
    const resumen = this.resumenEvento();
    if (!resumen || resumen.totalMuestra === 0) return 0;
    return Math.round((resumen.contados / resumen.totalMuestra) * 100);
  });

  async toggleResumen(): Promise<void> {
    const nuevoEstado = !this.resumenVisible();
    this.resumenVisible.set(nuevoEstado);

    // Si se está abriendo y no hay datos cargados, cargar el resumen
    if (nuevoEstado && !this.resumenEvento()) {
      await this.cargarResumen();
    }
  }

  private async cargarResumen(): Promise<void> {
    const evento = this.currentEvent();
    const operadorId = this.auth.session()?.operadorId;
    const pdaId = this.pda.pdaId();

    if (!evento || !operadorId || !pdaId) return;

    this.resumenCargando.set(true);
    try {
      await this.resumenFacade.cargarAvance(evento.id, operadorId, pdaId);
      this.resumenEvento.set(this.resumenFacade.avance());
    } finally {
      this.resumenCargando.set(false);
    }
  }

  /*
   * La inicialización va acá y no en el constructor: si Ionic reutiliza la
   * instancia, el constructor no vuelve a correr y se seguiría contando contra
   * la ubicación anterior. La comparación con `sesionInicializada` evita el otro
   * extremo — volver desde el resumen no puede reiniciar un conteo en curso.
   */
  async ionViewWillEnter(): Promise<void> {
    const ubicacionId = this.zonaFacade.ubicacionId();
    const operadorId  = this.auth.session()?.operadorId;
    const pdaId       = this.pda.pdaId();

    await this.eventoFacade.refreshSelected();
    const evento = this.currentEvent();

    if (isDevMode()) {
      console.log('[CountingPage] ionViewWillEnter', { evento, ubicacionId });
    }

    // Si el evento cambió a EN_ANALISIS o CERRADO (ej: desde otra PDA), redirigir a home
    if (evento?.estado === 'EN_ANALISIS' || evento?.estado === 'CERRADO') {
      this.router.navigate(['/home']);
      return;
    }

    if (!evento || !ubicacionId || !operadorId || !pdaId) return;

    // La ronda se resuelve en cada entrada: la franja de color y el número que ve
    // el operador no pueden depender de que haya pasado antes por otra pantalla.
    void this.conteoList.cargarIteracionActiva(evento.id);
    /*
     * Se exige además que la sesión siga viva en el facade: si algo la soltó por
     * fuera (reiniciar la base local), la ubicación puede volver a tener el mismo
     * id y este atajo dejaría la pantalla sin sesión, escaneando contra nada.
     */
    if (ubicacionId === this.sesionInicializada && this.conteo.enCurso()) return;

    this.sesionInicializada = ubicacionId;
    /*
     * Se espera de verdad: abrir la sesión encadena varias consultas (resolver
     * la ronda, cargar el mapa de SKU de la muestra) y hasta que terminan
     * ConteoFacade.scan() no tiene sesión y devuelve 'rechazado'. Sin este
     * await, un disparo de pistola apenas entrar se perdía y encima se le
     * mostraba al operador como "fuera de muestra".
     *
     * El escáner queda bloqueado mientras tanto — ver [locked] en el template.
     */
    await this.conteo.init(evento.id, ubicacionId, operadorId, pdaId);

    // Precargar el resumen de avance si ya está visible
    if (this.resumenVisible()) {
      void this.cargarResumen();
    }
  }

  onBusquedaInput(event: Event): void {
    const value = (event as CustomEvent<{ value: string | null }>).detail.value ?? '';
    this.busquedaSku.set(value);
    this.visibleCount.set(this.PAGE_SIZE);
  }

  onCantidadInput(event: Event): void {
    const value = Number((event as CustomEvent<{ value: string | null }>).detail.value);
    this.cantidad.set(Number.isFinite(value) && value >= 0 ? Math.floor(value) : 1);
  }

  onModoChange(event: Event): void {
    const value = (event as CustomEvent<{ value: string }>).detail.value;
    if (value !== 'uno' && value !== 'cantidad') return;
    if (value === this.modoCaptura()) return;
    this.modoCaptura.set(value);
    // Cambiar de modo con una captura a medias la descarta: nada se escribió todavía.
    this.cerrarCaptura();
  }

  async onScanSku(capturado: CodigoCapturado): Promise<void> {
    const codigo = capturado.codigo.trim().toUpperCase();

    if (this.modoCaptura() === 'uno') {
      await this.registrar(codigo, 1, capturado.medio);
      return;
    }

    /*
     * Se valida acá y no al guardar: pedirle las unidades para recién entonces
     * avisarle que el SKU no pertenece a la muestra es trabajo tirado.
     */
    if (!this.conteo.estaEnMuestra(codigo)) {
      this.setLastScan({ sku: codigo, estado: 'FUERA_DE_MUESTRA' });
      this.scanComp()?.limpiar();
      return;
    }

    this.cantidad.set(1);
    this.skuPendiente.set({ codigo, medio: capturado.medio });
    // El foco lo cede ScanComponent vía [cederFoco]; acá se lo lleva la cantidad.
    setTimeout(() => void this.cantidadInput()?.setFocus(), 60);
  }

  async guardarCantidad(): Promise<void> {
    const pendiente = this.skuPendiente();
    if (pendiente === null) return;

    // Si no se registró (canceló una confirmación) la captura sigue abierta: el
    // operador corrige la cantidad en vez de volver a leer el SKU.
    if (!(await this.registrar(pendiente.codigo, this.cantidad(), pendiente.medio))) return;

    this.cerrarCaptura();
  }

  cancelarCaptura(): void {
    this.cerrarCaptura();
  }

  private cerrarCaptura(): void {
    this.skuPendiente.set(null);
    this.cantidad.set(1);
    // Devuelve el foco al escáner: sin esto el operador tiene que tocar la
    // pantalla entre lectura y lectura y la pistola deja de servir.
    this.scanComp()?.limpiar();
  }

  /*
   * Punto único de escritura de los dos modos. Devuelve false solo cuando el
   * operador canceló una confirmación de cantidad (cero o inusualmente alta) —
   * un rechazo por muestra o una falla de escritura sí cierran el ciclo, con su
   * banner.
   */
  private async registrar(codigo: string, cantidad: number, medio: MedioCaptura): Promise<boolean> {
    if (!(await this.confirmarCantidad(codigo, cantidad))) return false;

    const resultado = await this.conteo.scan(codigo, cantidad, medio);
    if (resultado === 'error') {
      this.setLastScan({ sku: codigo, estado: 'ERROR', mensaje: this.conteo.error() ?? 'No se pudo registrar el scan' });
    } else {
      this.setLastScan({ sku: codigo, estado: resultado === 'valido' ? 'OK' : 'FUERA_DE_MUESTRA' });

      // Si el resumen está visible, recargarlo para actualizar el % de avance
      if (this.resumenVisible() && resultado === 'valido') {
        void this.cargarResumen();
      }
    }
    return true;
  }

  /*
   * Dos controles sobre el mismo número, por motivos opuestos:
   *
   *  - 0     → es una declaración válida (producto vendido o despachado), pero
   *            también el resultado típico de un borrado accidental.
   *  - ≥2000 → es posible (tornillería a granel), pero también el resultado
   *            típico de un dedo de más: 2000 donde iban 20.
   *
   * Ninguno bloquea: preguntan y siguen si el operador confirma. Un tope duro
   * dejaría fuera conteos legítimos y el operador terminaría partiéndolos en
   * pedazos para esquivarlo, que es peor que el dato alto.
   */
  private confirmarCantidad(codigo: string, cantidad: number): Promise<boolean> {
    if (cantidad === 0) {
      return this.preguntar('Confirmar cantidad', `¿Confirmas que ${codigo} tiene 0 unidades?`);
    }
    if (cantidad >= this.CANTIDAD_ALTA) {
      return this.preguntar(
        'Cantidad inusualmente alta',
        `Vas a registrar ${cantidad} unidades de ${codigo}. Revisa que no sea un error de tipeo.`
      );
    }
    return Promise.resolve(true);
  }

  private preguntar(header: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.alertController.create({
        header,
        message,
        buttons: [
          { text: 'Cancelar', role: 'cancel', handler: () => resolve(false) },
          { text: 'Confirmar', role: 'confirm', handler: () => resolve(true) },
        ],
      }).then((alert) => {
        // Cerrar tocando fuera del alert no dispara ningún handler: sin esto la
        // promesa quedaba colgada y el scan no terminaba nunca.
        void alert.onDidDismiss().then(() => resolve(false));
        return alert.present();
      });
    });
  }

  private setLastScan(scan: ResultadoScan): void {
    clearTimeout(this.lastScanTimeoutId);
    this.lastScan.set(scan);
    this.lastScanTimeoutId = setTimeout(() => this.lastScan.set(null), 3000);
  }

  /*
   * Los botones +/- de la lista pueden llegar a 0: dejar un SKU en cero es un dato
   * válido y es distinto de borrarlo del conteo. Como el cero es una declaración
   * (no hay unidades), se confirma igual que al escanearlo.
   */
  async adjust(productoId: number, delta: number): Promise<void> {
    const item = this.itemsView().find((i) => i.productoId === productoId);
    if (!item) return;

    const siguiente = Math.max(0, item.cantidad + delta);
    // Ya está en 0 y se sigue bajando: no hay nada que confirmar ni que escribir.
    if (siguiente === item.cantidad) return;

    /*
     * Solo se controla el cero. La alerta de cantidad alta no aplica acá: +1 no
     * es un error de tipeo, y dispararla al cruzar el umbral la volvería ruido
     * en cada clic posterior.
     */
    if (siguiente === 0 && !(await this.preguntar('Confirmar cantidad', `¿Confirmas que ${item.sku} tiene 0 unidades?`))) return;

    await this.conteo.adjust(productoId, delta);

    // Si el resumen está visible, recargarlo para actualizar el % de avance
    if (this.resumenVisible()) {
      void this.cargarResumen();
    }
  }

  async delete(productoId: number): Promise<void> {
    const item = this.itemsView().find((i) => i.productoId === productoId);
    if (!item) return;
    const alert = await this.alertController.create({
      header:  'Eliminar producto',
      message: `¿Eliminar ${item.descripcion} (cantidad ${item.cantidad}) del conteo?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: async () => {
          await this.conteo.delete(productoId);
          // Si el resumen está visible, recargarlo para actualizar el % de avance
          if (this.resumenVisible()) {
            void this.cargarResumen();
          }
        }},
      ],
    });
    await alert.present();
  }

  /*
   * Reintenta abrir la sesión con los mismos datos con los que se entró. Sirve
   * para fallas transitorias de la base; si el motivo es que no hay ronda
   * abierta —el evento está en el flujo del analista— va a volver a fallar, y
   * para eso está el botón de volver a Inicio al lado.
   */
  async reintentarSesion(): Promise<void> {
    const evento     = this.currentEvent();
    const ubicacionId = this.zonaFacade.ubicacionId();
    const operadorId = this.auth.session()?.operadorId;
    const pdaId      = this.pda.pdaId();
    if (!evento || !ubicacionId || !operadorId || !pdaId) return;

    await this.conteo.init(evento.id, ubicacionId, operadorId, pdaId);
  }

  volverAInicio(): void {
    this.router.navigate(['/home']);
  }

  /*
   * Salida para un TAG abierto por error. Solo se ofrece sin líneas contadas:
   * con productos registrados el camino es finalizar, no descartar.
   *
   * Es imprescindible que exista: noSesionActivaGuard bloquea /home mientras la
   * sesión siga viva, y finalizarTag() exige al menos un producto. Sin esto, el
   * operador que abre el TAG equivocado queda encerrado en esta pantalla.
   *
   * No toca la base: no hay filas que borrar, y la ubicación registrada se
   * reutiliza si vuelve a elegir el mismo TAG.
   */
  async descartarTag(): Promise<void> {
    if (this.itemsView().length > 0) return;

    const alert = await this.alertController.create({
      header:  'Descartar TAG',
      message: `Vas a salir del TAG ${this.tagActual()} sin contar nada. No queda registrado.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Descartar', role: 'confirm', handler: () => { this.doDescartarTag(); } },
      ],
    });
    await alert.present();
  }

  private doDescartarTag(): void {
    this.skuPendiente.set(null);
    this.conteo.reset();
    this.zonaFacade.clearTag();
    // Sin esto, volver a elegir el mismo TAG reutiliza el ubicacionId y el
    // atajo de ionViewWillEnter se saltaría el init de la sesión nueva.
    this.sesionInicializada = null;
    this.router.navigate(['/counting-tag']);
  }

  async finalizarTag(): Promise<void> {
    if (this.itemsView().length === 0) return;

    const alert = await this.alertController.create({
      header:  'Finalizar TAG',
      message: `Vas a finalizar el TAG ${this.tagActual()} con ${this.totalItems()} producto(s).`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Finalizar', role: 'confirm', handler: () => { void this.doFinalizarTag(); } },
      ],
    });
    await alert.present();
  }

  // Cierra la sesión en sod_conteo (EN_CURSO → FINALIZADO) y vuelve a TAG+Zona
  // para el siguiente. Intenta sincronizar automáticamente con el WS.
  private async doFinalizarTag(): Promise<void> {
    this.finalizando.set(true);
    // Cerrada esta sesión, volver a entrar a la misma ubicación debe arrancar de cero.
    this.sesionInicializada = null;
    this.skuPendiente.set(null);

    const sesion  = this.conteo.sesion();
    const evento  = this.currentEvent();
    // Se lee antes de finalizar: después el reset lo deja vacío y el aviso de
    // fallo se quedaría sin el código que el operador necesita para reintentar.
    const tag     = this.tagActual();
    const operadorId = this.auth.session()?.operadorId;
    const pdaId      = this.pda.pdaId();

    try {
      await this.conteo.finalizar();

      /*
       * Con la sincronización automática apagada el TAG queda en FINALIZADO, no
       * en SINCRONIZADO: así sigue siendo editable desde el resumen. Subirlo
       * pasa a ser una acción explícita del operador.
       */
      if (!this.ajustes.sincronizacionAutomatica()) {
        /*
         * Esto NO es un fallo: el operador apagó la sincronización automática y
         * el TAG quedó pendiente porque así lo pidió. Va como toast; obligarlo a
         * tocar Aceptar en cada TAG del día sería castigarlo por su propia
         * configuración.
         */
        this.mostrarToast('TAG finalizado. Queda pendiente de sincronizar.', 'warning');
      } else if (sesion && operadorId && pdaId) {
        try {
          await this.conteoList.load(operadorId, pdaId);
          const resumen = this.conteoList.conteos().find((c) =>
            c.conteoId === sesion.conteoId &&
            c.ubicacionId === sesion.ubicacionId &&
            c.operadorId === operadorId &&
            c.pdaId === pdaId &&
            c.estado === 'FINALIZADO'
          );
          const sincronizado = resumen ? await this.conteoList.sincronizar(resumen) : false;

          if (sincronizado) {
            this.mostrarToast('TAG finalizado y sincronizado.', 'success');
          } else {
            /*
             * El await es el punto de todo el cambio: la navegación de más abajo
             * espera a que el operador toque Aceptar. Antes la toast se mostraba
             * y la app cambiaba de pantalla en el mismo tick, así que el aviso
             * pasaba mientras él ya estaba mirando otra cosa.
             */
            await this.avisoSync.avisarFalloTag(tag, this.conteoList.error());
          }
        } catch (err) {
          await this.avisoSync.avisarFalloTag(
            tag,
            err instanceof Error ? err.message : null,
          );
        }
      }

      this.zonaFacade.reset();
      this.conteo.reset();
      this.router.navigate(['/counting-tag']);
    } finally {
      this.finalizando.set(false);
    }
  }

  private async mostrarToast(message: string, color: 'success' | 'warning'): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2500,
      color,
      position: 'top',
    });
    await toast.present();
  }
}
