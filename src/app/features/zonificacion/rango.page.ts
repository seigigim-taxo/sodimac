import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, alertOutline, barcodeOutline, informationCircleOutline } from 'ionicons/icons';
import { IdRango } from '../../domain/zonificacion/models/rango-zonificacion.model';
import { evaluarFormularioRango } from '../../domain/zonificacion/utils/formulario-rango.utils';
import { mensajeZonificacion } from '../../domain/zonificacion/utils/mensajes-zonificacion.utils';
import { NetworkService } from '../../shared/services/network.service';
import { ZonificacionFacade } from '../../state/zonificacion/zonificacion.facade';

/* Un TAG se escanea o se escribe: acá solo cuenta lo que parece un número. */
const soloTexto = (valor: string | null | undefined): string => (valor ?? '').toString();

/*
 * Nuevo rango o edición de uno existente.
 *
 * El operador escanea (o escribe) el primer y el último TAG. La zona sale sola
 * del primero y la cantidad se calcula sola; todo lo que impediría guardar se
 * avisa mientras escribe, con las mismas reglas del servidor. Guardar deja el
 * rango en la cola y vuelve al resumen: el envío sale en segundo plano.
 *
 * El escáner de la PDA entrega el TAG como teclado y termina con Enter: Enter
 * en el primer TAG pasa al segundo, y Enter en el segundo guarda si se puede.
 */
@Component({
  selector: 'app-zonificacion-rango',
  templateUrl: './rango.page.html',
  standalone: true,
  imports: [IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonTitle, IonToolbar],
})
export class ZonificacionRangoPage implements ViewWillEnter {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private facade = inject(ZonificacionFacade);
  private network = inject(NetworkService);

  @ViewChild('hastaEl') hastaEl?: ElementRef<HTMLIonInputElement>;

  isOnline = this.network.isOnline;

  desde = signal('');
  hasta = signal('');
  referencia = signal('');
  idRango = signal<IdRango | null>(null);
  guardando = signal(false);
  /* Lo que respondió el caso de uso si no aceptó guardar (otra regla, o un motivo local). */
  errorGuardar = signal<string | null>(null);

  private vista = computed(() => this.facade.estado()?.vista ?? null);
  private catalogo = computed(() => this.facade.catalogo()?.catalogo ?? null);

  titulo = computed(() => (this.idRango() === null ? 'Nuevo rango' : 'Editar rango'));
  sinCatalogo = computed(() => this.catalogo() === null);
  /* TAG que el conteo ya usó en la agenda: se avisa que al confirmar se validarán. */
  tagsUsados = computed(() => this.facade.estado()?.estado?.resumen.tagsUsados ?? 0);
  maxReferencia = computed(() => this.catalogo()?.parametros.referenciaLargoMaximo ?? 250);

  evaluacion = computed(() => {
    const vista = this.vista();
    const catalogo = this.catalogo();
    if (!vista || !catalogo) return null;
    return evaluarFormularioRango(
      { desde: this.desde(), hasta: this.hasta(), referencia: this.referencia(), idRango: this.idRango() },
      { estado: vista.estado, catalogo, vista },
    );
  });

  puedeGuardar = computed(() => !!this.evaluacion()?.puedeGuardar && !this.guardando());

  constructor() {
    addIcons({ alertCircleOutline, alertOutline, barcodeOutline, informationCircleOutline });
  }

  ionViewWillEnter(): void {
    const idAgenda = Number(this.route.snapshot.paramMap.get('idAgenda'));
    // Sin la agenda abierta (se retomó la app en esta pantalla) no hay contra qué validar: se vuelve a la lista.
    if (this.facade.agenda()?.idAgenda !== idAgenda || !this.facade.estado()) {
      void this.router.navigate(['/zonificacion'], { replaceUrl: true });
      return;
    }

    this.guardando.set(false);
    this.errorGuardar.set(null);
    const editar = this.route.snapshot.queryParamMap.get('rango');
    const rango = editar === null ? undefined : this.vista()?.rangos.find((r) => String(r.id) === editar);
    this.idRango.set(rango?.id ?? null);
    this.desde.set(rango ? String(rango.tagDesde) : '');
    this.hasta.set(rango ? String(rango.tagHasta) : '');
    this.referencia.set(rango?.referenciaUbicacion ?? '');
  }

  onDesde(ev: Event): void {
    this.desde.set(soloTexto((ev as CustomEvent<{ value: string | null }>).detail.value));
    this.errorGuardar.set(null);
  }

  onHasta(ev: Event): void {
    this.hasta.set(soloTexto((ev as CustomEvent<{ value: string | null }>).detail.value));
    this.errorGuardar.set(null);
  }

  onReferencia(ev: Event): void {
    this.referencia.set(soloTexto((ev as CustomEvent<{ value: string | null }>).detail.value));
    this.errorGuardar.set(null);
  }

  /* Enter en el primer TAG (lo que manda el escáner al terminar) pasa al segundo. */
  enterEnDesde(): void {
    setTimeout(() => void this.hastaEl?.nativeElement?.setFocus?.(), 50);
  }

  enterEnHasta(): void {
    if (this.puedeGuardar()) void this.guardar();
  }

  async guardar(): Promise<void> {
    const ev = this.evaluacion();
    const agenda = this.facade.agenda();
    if (!ev?.puedeGuardar || !ev.zona || ev.desde === null || ev.hasta === null || !agenda || this.guardando()) return;

    this.guardando.set(true);
    this.errorGuardar.set(null);
    try {
      const r = await this.facade.guardarRango({
        agenda,
        idRango: this.idRango(),
        codigoZona: ev.zona.codigoZona,
        tagDesde: ev.desde,
        tagHasta: ev.hasta,
        referenciaUbicacion: this.referencia().trim() === '' ? null : this.referencia(),
      });
      if (r.ok) {
        await this.volver();
      } else {
        this.errorGuardar.set(mensajeZonificacion(r.codigo, r.data));
      }
    } finally {
      this.guardando.set(false);
    }
  }

  async volver(): Promise<void> {
    await this.router.navigate(['/zonificacion', this.facade.agenda()?.idAgenda], { replaceUrl: true });
  }
}
