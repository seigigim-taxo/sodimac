import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import { ActionSheetController, AlertController, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, checkmarkCircleOutline, cloudOfflineOutline, informationCircleOutline, layersOutline, lockClosedOutline, refreshOutline, timeOutline } from 'ionicons/icons';
import { OperacionEnCola } from '../../domain/zonificacion/models/operacion-zonificacion.model';
import { decidirConfirmacion, textoReabrir } from '../../domain/zonificacion/utils/confirmacion-zonificacion.utils';
import { ETIQUETA_ESTADO_VISUAL, TONO_ESTADO_VISUAL, estadoVisualDeResumen } from '../../domain/zonificacion/utils/estado-visual.utils';
import { FilaRango, filasDeRangos, totalesDeResumen } from '../../domain/zonificacion/utils/filas-resumen.utils';
import { mensajeZonificacion } from '../../domain/zonificacion/utils/mensajes-zonificacion.utils';
import { NetworkService } from '../../shared/services/network.service';
import { MensajeZonificacion, ZonificacionFacade } from '../../state/zonificacion/zonificacion.facade';

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
  private actionSheet = inject(ActionSheetController);
  private alertas = inject(AlertController);

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
    return agenda.soloLectura ? 'Solo lectura. Puedes ver esta agenda, pero no modificarla.' : null;
  });

  /* El resultado de lo último que hizo el operador ("Rango guardado."); se muestra una vez. */
  mensaje = signal<MensajeZonificacion | null>(null);

  /* Se puede modificar algo en esta agenda (operable, con escritura y asignada). */
  puedeModificar = computed(() => !!this.estado() && this.restriccion() === null);
  /* Guardar y eliminar rangos solo con la zonificación en borrador; anular TAG no depende del estado. */
  puedeEditarRangos = computed(() => this.puedeModificar() && this.vista()?.estado !== 'CONFIRMADA');
  /* Confirmar (borrador) y reabrir (confirmada) son las dos caras de la misma acción. */
  puedeConfirmar = computed(() => this.puedeEditarRangos());
  puedeReabrir = computed(() => this.puedeModificar() && this.vista()?.estado === 'CONFIRMADA');
  /* Lo que se dice si hay TAG usados fuera de rango: en una confirmada, además, hay que reabrirla. */
  pedirReabrirPorTagsFuera = computed(() => this.vista()?.estado === 'CONFIRMADA');

  constructor() {
    addIcons({ alertCircleOutline, checkmarkCircleOutline, cloudOfflineOutline, informationCircleOutline, layersOutline, lockClosedOutline, refreshOutline, timeOutline });
  }

  async ionViewWillEnter(): Promise<void> {
    // Lo que dejó la pantalla anterior (guardar, anular...) se muestra una sola vez.
    this.mensaje.set(this.facade.consumirMensaje());
    const idAgenda = Number(this.route.snapshot.paramMap.get('idAgenda'));
    // El número de agenda sale de la lista descargada: sin ella no hay a qué agenda ir.
    const agenda = this.facade.agendas()?.lista?.agendas.find((a) => a.idAgenda === idAgenda);
    const yaAbierta = this.facade.agenda()?.idAgenda === idAgenda && this.facade.estado() !== null;
    if (yaAbierta) {
      // Se vuelve de otra pantalla (guardar un rango, anular...): lo hecho se ve al instante, sin vaciar la
      // pantalla ni esperar al servidor; lo del servidor se actualiza después, por encima.
      await this.facade.refrescarVistaLocal();
      await this.facade.refrescarEstado();
    } else if (agenda) {
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
  /*
   * Confirmar. Primero se mira lo que ya se sabe en la PDA: si hay envíos sin
   * salir, o TAG usados sin rango, o no hay rangos, se explica sin molestar al
   * servidor. Solo si está todo en orden se pide la confirmación.
   */
  async confirmar(): Promise<void> {
    const vista = this.vista();
    if (!vista) return;
    const decision = decidirConfirmacion(vista, this.estado());

    if (decision.tipo === 'ERROR') {
      this.mensaje.set({ tipo: 'error', texto: decision.texto });
      return;
    }
    if (decision.tipo === 'BLOQUEO') {
      const aviso = await this.alertas.create({ header: decision.titulo, message: decision.texto, buttons: [{ text: 'Entendido', role: 'cancel' }] });
      await aviso.present();
      return;
    }
    const dialogo = await this.alertas.create({
      header: decision.titulo,
      message: decision.texto,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Confirmar', handler: () => void this.ejecutarConfirmar() },
      ],
    });
    await dialogo.present();
  }

  private async ejecutarConfirmar(): Promise<void> {
    const agenda = this.facade.agenda();
    if (!agenda) return;
    const r = await this.facade.confirmarZonificacion(agenda);
    this.mensaje.set(r.ok ? this.facade.consumirMensaje() : { tipo: 'error', texto: mensajeZonificacion(r.codigo, r.data) });
  }

  async reabrir(): Promise<void> {
    const dialogo = await this.alertas.create({
      header: 'Reabrir zonificación',
      message: textoReabrir(this.estado()?.resumen.tagsUsados ?? 0),
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Reabrir', handler: () => void this.ejecutarReabrir() },
      ],
    });
    await dialogo.present();
  }

  private async ejecutarReabrir(): Promise<void> {
    const agenda = this.facade.agenda();
    if (!agenda) return;
    const r = await this.facade.reabrirZonificacion(agenda);
    this.mensaje.set(r.ok ? this.facade.consumirMensaje() : { tipo: 'error', texto: mensajeZonificacion(r.codigo, r.data) });
  }

  nuevoRango(): void {
    void this.router.navigate(['/zonificacion', this.facade.agenda()?.idAgenda, 'rango']);
  }

  anularTag(): void {
    void this.router.navigate(['/zonificacion', this.facade.agenda()?.idAgenda, 'anular']);
  }

  /* Tocar un rango abre la hoja de acciones: editarlo o eliminarlo. */
  async abrirFila(fila: FilaRango): Promise<void> {
    if (!this.puedeEditarRangos()) return;

    const detalle = [`${fila.cantidad} TAG`, fila.referencia, fila.usados !== null ? `${fila.usados} usados` : null].filter((x) => !!x).join(' · ');
    const hoja = await this.actionSheet.create({
      header: `${fila.zona} · ${fila.rango}`,
      subHeader: detalle,
      buttons: [
        { text: 'Editar rango', handler: () => void this.editar(fila) },
        { text: 'Eliminar rango', role: 'destructive', handler: () => void this.confirmarEliminar(fila) },
        { text: 'Cerrar', role: 'cancel' },
      ],
    });
    await hoja.present();
  }

  private editar(fila: FilaRango): Promise<boolean> {
    return this.router.navigate(['/zonificacion', this.facade.agenda()?.idAgenda, 'rango'], { queryParams: { rango: String(fila.id) } });
  }

  private async confirmarEliminar(fila: FilaRango): Promise<void> {
    const alerta = await this.alertas.create({
      header: 'Eliminar rango',
      message: `¿Eliminar el rango ${fila.zona} ${fila.rango}? Los TAG ya capturados no se tocan.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => void this.eliminar(fila) },
      ],
    });
    await alerta.present();
  }

  private async eliminar(fila: FilaRango): Promise<void> {
    const agenda = this.facade.agenda();
    if (!agenda) return;
    const r = await this.facade.eliminarRango(agenda, fila.id);
    this.mensaje.set(r.ok ? this.facade.consumirMensaje() : { tipo: 'error', texto: mensajeZonificacion(r.codigo, r.data) });
  }
}
