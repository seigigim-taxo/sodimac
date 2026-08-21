import { Component, inject, signal, computed } from '@angular/core';
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
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline, alertCircleOutline, chevronDownOutline, chevronUpOutline, closeOutline, flagOutline, refreshOutline, removeOutline, searchOutline, statsChartOutline, trashOutline,
} from 'ionicons/icons';
import { ScanComponent } from '../../../shared/components/scan/scan.component';
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
    IonMenuButton,
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

  online = this.network.isOnline;

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
  iniciandoSesion = signal(false);
  sesionError = signal<string | null>(null);

  // Resumen de avance del evento: panel expandible que muestra el progreso global
  resumenVisible = signal(false);
  resumenEvento = signal<ResumenEvento | null>(null);
  resumenCargando = signal(false);

  // Ronda en curso: se deriva de sod_conteo, que es la única tabla que la guarda.
  iteracionActual = this.conteoList.iteracionActiva;

  // Franja de color por iteración: el operador tiene que ver de un vistazo en qué
  // ronda está. Cicla si hubiera más rondas que colores definidos.
  private static readonly COLORES_ITERACION = ['--app-success', '--app-warning', '--app-info', '--app-accent'];
  colorIteracion = computed(() => {
    const colores = CountingPageComponent.COLORES_ITERACION;
    return `var(${colores[(this.iteracionActual() - 1) % colores.length]})`;
  });

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
    addIcons({ addOutline, alertCircleOutline, chevronDownOutline, chevronUpOutline, closeOutline, flagOutline, refreshOutline, removeOutline, searchOutline, statsChartOutline, trashOutline });
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

    console.log('[CountingPage] ionViewWillEnter - evento:', evento);
    console.log('[CountingPage] ionViewWillEnter - evento.id:', evento?.id);
    console.log('[CountingPage] ionViewWillEnter - ubicacionId:', ubicacionId);

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

    this.iniciandoSesion.set(true);
    this.sesionError.set(null);
    try {
      this.sesionInicializada = ubicacionId;
      await this.conteo.init(evento.id, ubicacionId, operadorId, pdaId);
    } catch (err) {
      this.sesionError.set(err instanceof Error ? err.message : 'Error al iniciar sesión de conteo');
      this.sesionInicializada = null;
    } finally {
      this.iniciandoSesion.set(false);
    }

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

  async onScanSku(sku: string): Promise<void> {
    const codigo   = sku.trim().toUpperCase();
    const cantidad = this.cantidad();

    // Contar en cero es válido (ej. producto vendido/despachado), pero se confirma
    // antes de persistir para evitar que sea un error de digitación.
    if (cantidad === 0 && !(await this.confirmarCantidadCero(codigo))) {
      this.cantidad.set(1);
      return;
    }

    const resultado = await this.conteo.scan(codigo, cantidad);
    if (resultado === 'error') {
      this.setLastScan({ sku: codigo, estado: 'ERROR', mensaje: this.conteo.error() ?? 'No se pudo registrar el scan' });
    } else {
      this.setLastScan({ sku: codigo, estado: resultado === 'valido' ? 'OK' : 'FUERA_DE_MUESTRA' });

      // Si el resumen está visible, recargarlo para actualizar el % de avance
      if (this.resumenVisible() && resultado === 'valido') {
        void this.cargarResumen();
      }
    }
    this.cantidad.set(1);
  }

  private confirmarCantidadCero(codigo: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.alertController.create({
        header:  'Confirmar cantidad',
        message: `¿Confirmas que ${codigo} tiene 0 unidades?`,
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

    if (siguiente === 0 && !(await this.confirmarCantidadCero(item.sku))) return;

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

  async reintentarSesion(): Promise<void> {
    const ubicacionId = this.zonaFacade.ubicacionId();
    const operadorId  = this.auth.session()?.operadorId;
    const pdaId       = this.pda.pdaId();
    const evento      = this.currentEvent();
    if (!evento || !ubicacionId || !operadorId || !pdaId) return;

    this.iniciandoSesion.set(true);
    this.sesionError.set(null);
    try {
      this.sesionInicializada = ubicacionId;
      await this.conteo.init(evento.id, ubicacionId, operadorId, pdaId);
    } catch (err) {
      this.sesionError.set(err instanceof Error ? err.message : 'Error al iniciar sesión de conteo');
      this.sesionInicializada = null;
    } finally {
      this.iniciandoSesion.set(false);
    }
  }

  async descartarTag(): Promise<void> {
    // Opción 1 conservador: no borrar si ya tiene productos escaneados.
    if (this.itemsView().length > 0) {
      await this.mostrarToast('Este TAG tiene productos registrados. Finalízalo o elimina los productos antes de salir.', 'warning');
      return;
    }

    const alert = await this.alertController.create({
      header:  'Descartar TAG',
      message: '¿Descartar la sesión de este TAG y volver a seleccionar zona?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Descartar', role: 'destructive', handler: () => {
          this.sesionInicializada = null;
          this.conteo.reset();
          this.zonaFacade.reset();
          this.router.navigate(['/counting-tag']);
        }},
      ],
    });
    await alert.present();
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

    const sesion  = this.conteo.sesion();
    const evento  = this.currentEvent();
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
          if (resumen) {
            const subido = await this.conteoList.sincronizar(resumen);
            this.mostrarToast(
              subido ? 'TAG finalizado y sincronizado.' : 'TAG finalizado localmente. Queda pendiente de sincronizar.',
              subido ? 'success' : 'warning'
            );
          } else {
            this.mostrarToast('TAG finalizado localmente. Queda pendiente de sincronizar.', 'warning');
          }
        } catch {
          this.mostrarToast('TAG finalizado localmente. Sincronización pendiente.', 'warning');
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
