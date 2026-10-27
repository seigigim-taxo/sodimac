import { Component, computed, inject } from '@angular/core';
import { ViewWillEnter } from '@ionic/angular';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline, informationCircleOutline } from 'ionicons/icons';
import { RechazoZonificacion } from '../../application/zonificacion/listar-rechazadas-zonificacion.use-case';
import { NetworkService } from '../../shared/services/network.service';
import { etiquetaDia } from '../../shared/utils/fecha.utils';
import { ZonificacionFacade } from '../../state/zonificacion/zonificacion.facade';

/* Un envío rechazado, ya listo para mostrar. */
export interface FilaRechazada extends RechazoZonificacion {
  /* "Agenda AG-... · Hoy 10:42". */
  subtitulo: string;
}

/* "Hoy 10:42", "Mañana 08:00" o "Lun 26/10 10:42", a partir de la fecha y hora local del envío. */
export function cuandoSeHizo(fechaHoraLocal: string, hoy?: string): string {
  const [dia, hora = ''] = fechaHoraLocal.split(' ');
  return `${etiquetaDia(dia, hoy)} ${hora.slice(0, 5)}`.trim();
}

/*
 * "Envíos rechazados": lo que el servidor no aceptó. Esta pieza no existe en el
 * SGO: nace de trabajar sin conexión, donde una acción puede llegar tarde y
 * encontrar la agenda cambiada (otra PDA la confirmó, el rango ya no existe...).
 *
 * Descartar solo quita el envío de esta PDA: no cambia nada en el SGO.
 */
@Component({
  selector: 'app-zonificacion-rechazados',
  templateUrl: './rechazados.page.html',
  standalone: true,
  imports: [IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar],
})
export class ZonificacionRechazadosPage implements ViewWillEnter {
  private facade = inject(ZonificacionFacade);
  private network = inject(NetworkService);

  isOnline = this.network.isOnline;

  filas = computed<FilaRechazada[]>(() =>
    this.facade.rechazos().map((r) => ({ ...r, subtitulo: `Agenda ${r.numeroAgenda} · ${cuandoSeHizo(r.fechaHoraLocal)}` })),
  );

  constructor() {
    addIcons({ checkmarkCircleOutline, informationCircleOutline });
  }

  async ionViewWillEnter(): Promise<void> {
    await this.facade.cargarRechazos();
  }

  descartar(fila: FilaRechazada): Promise<void> {
    return this.facade.descartarRechazo(fila.id);
  }

  descartarTodas(): Promise<void> {
    return this.facade.descartarTodasLasRechazadas();
  }
}
