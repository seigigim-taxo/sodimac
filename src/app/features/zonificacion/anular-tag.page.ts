import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonTextarea, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, barcodeOutline } from 'ionicons/icons';
import { evaluarAnulacion } from '../../domain/zonificacion/utils/formulario-rango.utils';
import { mensajeZonificacion } from '../../domain/zonificacion/utils/mensajes-zonificacion.utils';
import { NetworkService } from '../../shared/services/network.service';
import { ZonificacionFacade } from '../../state/zonificacion/zonificacion.facade';

const MINIMO_MOTIVO_POR_DEFECTO = 10;

/*
 * Anular un TAG de la agenda, con motivo. Se pide el número (se escanea o se
 * escribe), se muestra en qué rango está y cuánto baja su cantidad, y se exige
 * el motivo. Que el TAG tenga capturas en el conteo solo lo sabe el servidor: si
 * es el caso, el rechazo aparece en el resumen con su explicación.
 */
@Component({
  selector: 'app-zonificacion-anular-tag',
  templateUrl: './anular-tag.page.html',
  standalone: true,
  imports: [IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonTextarea, IonTitle, IonToolbar],
})
export class ZonificacionAnularTagPage implements ViewWillEnter {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private facade = inject(ZonificacionFacade);
  private network = inject(NetworkService);

  isOnline = this.network.isOnline;

  numero = signal('');
  motivo = signal('');
  enviando = signal(false);
  errorAnular = signal<string | null>(null);

  private vista = computed(() => this.facade.estado()?.vista ?? null);
  minimoMotivo = computed(() => this.facade.catalogo()?.catalogo?.parametros.motivoLargoMinimo ?? MINIMO_MOTIVO_POR_DEFECTO);
  sinCatalogo = computed(() => this.facade.catalogo()?.catalogo == null);

  evaluacion = computed(() => {
    const vista = this.vista();
    return vista ? evaluarAnulacion({ numero: this.numero(), motivo: this.motivo() }, vista, this.minimoMotivo()) : null;
  });

  puedeAnular = computed(() => !!this.evaluacion()?.puedeAnular && !this.enviando() && !this.sinCatalogo());

  constructor() {
    addIcons({ alertCircleOutline, barcodeOutline });
  }

  ionViewWillEnter(): void {
    const idAgenda = Number(this.route.snapshot.paramMap.get('idAgenda'));
    if (this.facade.agenda()?.idAgenda !== idAgenda || !this.facade.estado()) {
      void this.router.navigate(['/zonificacion'], { replaceUrl: true });
      return;
    }
    this.numero.set('');
    this.motivo.set('');
    this.enviando.set(false);
    this.errorAnular.set(null);
  }

  onNumero(ev: Event): void {
    this.numero.set(((ev as CustomEvent<{ value: string | null }>).detail.value ?? '').toString());
    this.errorAnular.set(null);
  }

  onMotivo(ev: Event): void {
    this.motivo.set(((ev as CustomEvent<{ value: string | null }>).detail.value ?? '').toString());
    this.errorAnular.set(null);
  }

  async anular(): Promise<void> {
    const ev = this.evaluacion();
    const agenda = this.facade.agenda();
    if (!ev?.puedeAnular || ev.numero === null || !agenda || this.enviando()) return;

    this.enviando.set(true);
    this.errorAnular.set(null);
    try {
      const r = await this.facade.anularTag(agenda, ev.numero, this.motivo());
      if (r.ok) {
        await this.volver();
      } else {
        this.errorAnular.set(mensajeZonificacion(r.codigo, r.data));
      }
    } finally {
      this.enviando.set(false);
    }
  }

  async volver(): Promise<void> {
    await this.router.navigate(['/zonificacion', this.facade.agenda()?.idAgenda], { replaceUrl: true });
  }
}
