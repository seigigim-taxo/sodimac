import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonProgressBar, IonSkeletonText, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, chevronForwardOutline, cloudOfflineOutline, informationCircleOutline, lockClosedOutline, refreshOutline } from 'ionicons/icons';
import { AgendaDeLista } from '../../domain/zonificacion/models/estado-agenda.model';
import { ETIQUETA_ESTADO_VISUAL, EstadoVisual, TONO_ESTADO_VISUAL, TonoEstado, estadoVisualDeLista } from '../../domain/zonificacion/utils/estado-visual.utils';
import { NetworkService } from '../../shared/services/network.service';
import { senalLentitud } from './lentitud';
import { etiquetaDia } from '../../shared/utils/fecha.utils';
import { ZonificacionFacade } from '../../state/zonificacion/zonificacion.facade';

/* Una agenda de la lista, ya lista para mostrar. */
export interface FilaAgenda {
  idAgenda: number;
  numeroAgenda: string;
  /* "Hoy", "Mañana" o "Lun 26/10". */
  titulo: string;
  tienda: string;
  estado: EstadoVisual;
  etiquetaEstado: string;
  tono: TonoEstado;
  detalle: string;
  /* Por qué no se puede modificar, si no se puede. */
  restriccion: string | null;
}

export function filaDeAgenda(a: AgendaDeLista, hoy: string): FilaAgenda {
  const estado = estadoVisualDeLista(a.zonificacion.estado, a.zonificacion.tagsCapturados);
  const partes: string[] = [];
  if (a.zonificacion.cantidadZonas > 0) {
    partes.push(`${a.zonificacion.cantidadZonas} ${a.zonificacion.cantidadZonas === 1 ? 'rango' : 'rangos'}`, `${a.zonificacion.tagsZonificados} TAG`);
  }
  if (a.zonificacion.tagsCapturados > 0) {
    partes.push(`${a.zonificacion.tagsCapturados} capturados`);
  }
  return {
    idAgenda: a.idAgenda,
    numeroAgenda: a.numeroAgenda,
    titulo: etiquetaDia(a.fechaAgenda, hoy),
    tienda: a.tienda.nombreTienda,
    estado,
    etiquetaEstado: ETIQUETA_ESTADO_VISUAL[estado],
    tono: TONO_ESTADO_VISUAL[estado],
    detalle: partes.join(' · '),
    restriccion: !a.operable ? (a.codigoEstado === 'SUSPENDIDA' ? 'Suspendida' : 'Cerrada') : a.soloLectura ? 'Solo lectura' : null,
  };
}

/*
 * Lista de agendas para zonificar: las mismas que baja la preparación (asignadas
 * al operador, hoy y la siguiente jornada), con el estado de su zonificación.
 * Sin red se muestra la última lista descargada.
 */
@Component({
  selector: 'app-zonificacion-agendas',
  templateUrl: './agendas.page.html',
  standalone: true,
  imports: [IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonProgressBar, IonSkeletonText, IonSpinner, IonTitle, IonToolbar],
})
export class ZonificacionAgendasPage implements ViewWillEnter {
  private router = inject(Router);
  private facade = inject(ZonificacionFacade);
  private network = inject(NetworkService);

  isOnline = this.network.isOnline;
  cargando = this.facade.cargandoAgendas;
  cargadas = this.facade.agendas;

  filas = computed<FilaAgenda[]>(() => {
    const lista = this.cargadas()?.lista;
    return lista ? lista.agendas.map((a) => filaDeAgenda(a, lista.hoy)) : [];
  });

  /* La primera vez, sin nada que mostrar todavía: esqueleto. Con algo en pantalla solo se actualiza por debajo. */
  primeraCarga = computed(() => this.cargando() && this.filas().length === 0);
  /* Si lleva demasiado cargando, se lo dice. */
  lento = senalLentitud(() => this.cargando());

  /* Sin red, lo que se ve es una copia: se dice de cuándo. */
  esCopia = computed(() => this.cargadas()?.origen === 'COPIA');
  fechaCopia = computed(() => this.cargadas()?.fechaDescarga ?? null);
  /* Sin red y sin copia no hay nada que mostrar. */
  sinDatos = computed(() => !this.cargando() && this.cargadas() !== null && this.cargadas()?.lista === null);
  /* El servidor contestó y no hay agendas asignadas. */
  sinAgendas = computed(() => !this.cargando() && this.cargadas()?.lista !== null && this.cargadas()?.lista !== undefined && this.filas().length === 0);

  constructor() {
    addIcons({ alertCircleOutline, chevronForwardOutline, cloudOfflineOutline, informationCircleOutline, lockClosedOutline, refreshOutline });
  }

  async ionViewWillEnter(): Promise<void> {
    await this.recargar();
  }

  async recargar(): Promise<void> {
    await this.facade.cargarAgendas();
  }

  abrir(fila: FilaAgenda): void {
    void this.router.navigate(['/zonificacion', fila.idAgenda]);
  }
}
