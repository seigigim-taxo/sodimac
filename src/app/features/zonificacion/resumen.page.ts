import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, checkmarkCircleOutline, cloudOfflineOutline, informationCircleOutline, lockClosedOutline, refreshOutline, timeOutline } from 'ionicons/icons';
import { OperacionEnCola } from '../../domain/zonificacion/models/operacion-zonificacion.model';
import { ETIQUETA_ESTADO_VISUAL, TONO_ESTADO_VISUAL, estadoVisualDeResumen } from '../../domain/zonificacion/utils/estado-visual.utils';
import { filasDeRangos, totalesDeResumen } from '../../domain/zonificacion/utils/filas-resumen.utils';
import { mensajeZonificacion } from '../../domain/zonificacion/utils/mensajes-zonificacion.utils';
import { NetworkService } from '../../shared/services/network.service';
import { ZonificacionFacade } from '../../state/zonificacion/zonificacion.facade';

/* Una operación que el servidor rechazó, con el motivo ya en palabras. */
export interface FilaRechazo {
  id: number;
  accion: string;
  motivo: string;
}

const ACCION: Record<OperacionEnCola['tipo'], string> = {
  GUARDAR_RANGO: 'Guardar un rango',
  ELIMINAR_RANGO: 'Eliminar un rango',
  ANULAR_TAG: 'Anular un TAG',
  CONFIRMAR: 'Confirmar la zonificación',
  REABRIR: 'Reabrir la zonificación',
};

export function filaDeRechazo(op: OperacionEnCola): FilaRechazo {
  return {
    id: op.id,
    accion: ACCION[op.tipo],
    motivo: op.error ? mensajeZonificacion(op.error.codigo, op.error.data) : (op.mensajeError ?? 'El servidor la rechazó.'),
  };
}

/*
 * Resumen de la zonificación de una agenda: estado, avance del conteo, rangos y
 * lo que quedó sin enviar. Es de lectura: guardar, editar, anular y confirmar
 * llegan en las fases siguientes.
 *
 * Con red muestra lo del servidor; sin red, la última copia. En los dos casos
 * ve encima lo que el operador hizo y todavía no salió, marcado "pendiente de
 * envío".
 */
@Component({
  selector: 'app-zonificacion-resumen',
  templateUrl: './resumen.page.html',
  standalone: true,
  imports: [IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar],
})
export class ZonificacionResumenPage implements ViewWillEnter {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private facade = inject(ZonificacionFacade);
  private network = inject(NetworkService);

  isOnline = this.network.isOnline;
  cargando = this.facade.cargandoEstado;
  cargado = this.facade.estado;

  vista = computed(() => this.cargado()?.vista ?? null);
  estado = computed(() => this.cargado()?.estado ?? null);
  /* La agenda se conoce aunque no haya estado (por ejemplo, sin red y sin copia). */
  titulo = computed(() => `Agenda ${this.facade.agenda()?.numeroAgenda ?? ''}`.trim());

  estadoVisual = computed(() => {
    const v = this.vista();
    const e = this.estado();
    return v ? estadoVisualDeResumen(v.estado, e?.resumen ?? null, e?.tagsFuera.total ?? 0, v.rangos.length > 0) : null;
  });
  etiquetaEstado = computed(() => (this.estadoVisual() ? ETIQUETA_ESTADO_VISUAL[this.estadoVisual()!] : ''));
  tono = computed(() => (this.estadoVisual() ? TONO_ESTADO_VISUAL[this.estadoVisual()!] : 'neutro'));

  filas = computed(() => {
    const v = this.vista();
    return v ? filasDeRangos(v, this.estado()) : [];
  });
  totales = computed(() => {
    const v = this.vista();
    return v ? totalesDeResumen(v) : { tagsZonificados: 0, tagsAnulados: 0 };
  });
  rechazos = computed(() => (this.vista()?.rechazadas ?? []).map(filaDeRechazo));
  pendientes = computed(() => this.vista()?.pendientes.length ?? 0);

  esCopia = computed(() => this.cargado()?.origen === 'COPIA');
  fechaCopia = computed(() => this.cargado()?.fechaDescarga ?? null);
  sinDatos = computed(() => !this.cargando() && this.cargado() !== null && this.cargado()?.estado === null && this.pendientes() === 0);

  /* Por qué no se puede modificar, si no se puede. */
  restriccion = computed<string | null>(() => {
    const agenda = this.estado()?.agenda;
    if (!agenda) return null;
    if (!agenda.operable) return agenda.codigoEstado === 'SUSPENDIDA' ? 'La agenda está suspendida.' : 'La agenda está cerrada.';
    return agenda.soloLectura ? 'Solo lectura: no puedes modificar esta agenda.' : null;
  });

  constructor() {
    addIcons({ alertCircleOutline, checkmarkCircleOutline, cloudOfflineOutline, informationCircleOutline, lockClosedOutline, refreshOutline, timeOutline });
  }

  async ionViewWillEnter(): Promise<void> {
    const idAgenda = Number(this.route.snapshot.paramMap.get('idAgenda'));
    // El número de agenda sale de la lista descargada: sin ella no hay a qué agenda ir.
    const agenda = this.facade.agendas()?.lista?.agendas.find((a) => a.idAgenda === idAgenda);
    if (agenda) {
      await this.facade.abrirAgenda({ idAgenda: agenda.idAgenda, numeroAgenda: agenda.numeroAgenda });
    } else if (this.facade.agenda()?.idAgenda === idAgenda) {
      await this.facade.refrescarEstado();
    } else {
      void this.router.navigate(['/zonificacion'], { replaceUrl: true });
    }
  }

  recargar(): Promise<void> {
    return this.facade.refrescarEstado();
  }

  descartar(fila: FilaRechazo): Promise<void> {
    return this.facade.descartarRechazada(fila.id);
  }
}
