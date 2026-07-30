import { Component, inject, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, checkmarkDoneOutline, cloudUploadOutline, createOutline, refreshOutline, timeOutline } from 'ionicons/icons';
import { TagsMockStore, ZONAS_MOCK } from '../../../state/counting-mock/tags-mock.store';
import { TagSesionStore } from '../../../state/counting-mock/tag-sesion.store';

/*
 * MOCK — resumen de tags con 2 estados: Pendiente (finalizado localmente,
 * sync falló, encolado) y Finalizado (sincronizado con éxito). Lee del
 * mismo TagsMockStore que la pantalla de trabajo, así que refleja en vivo
 * lo que se va cerrando ahí. El tag EN CURSO (el que se está contando
 * ahora, antes de "Finalizar TAG") no aparece aquí a propósito: su
 * recuperación tras un apagón es un problema de persistencia que resuelve
 * la propia pantalla de trabajo al reabrirse, no algo que este resumen
 * necesite mostrar.
 */
@Component({
  selector: 'app-tags-resumen',
  templateUrl: './tags-resumen.page.component.html',
  standalone: true,
  imports: [
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonMenuButton,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class TagsResumenPageComponent {
  private tagsStore       = inject(TagsMockStore);
  private tagSesion       = inject(TagSesionStore);
  private router          = inject(Router);
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);

  pendientes    = this.tagsStore.pendientes;
  finalizados   = this.tagsStore.finalizados;
  sincronizando = this.tagsStore.sincronizando;
  modoActual    = this.tagsStore.modoActual;
  hayConteoActivo = () => this.pendientes().length > 0 || this.finalizados().length > 0;

  // Resumen final del conteo activo
  totalMuestra    = this.tagsStore.totalMuestra;
  totalContados   = this.tagsStore.totalContados;
  totalFaltantes  = this.tagsStore.totalFaltantes;
  todosEnviados   = this.tagsStore.todosEnviados;

  /*
   * Sin conteo activo: se muestran pestañas, una por cada conteo ya
   * cerrado de este evento (solo lectura), más recientes primero.
   */
  conteosCerrados     = this.tagsStore.conteosCerradosDelEventoActual;
  conteoSeleccionadoId = signal<number | null>(null);
  conteoSeleccionado   = computed(() => {
    const id = this.conteoSeleccionadoId() ?? this.conteosCerrados()[0]?.id ?? null;
    return this.conteosCerrados().find((c) => c.id === id) ?? this.conteosCerrados()[0] ?? null;
  });
  noTags = () => !this.hayConteoActivo() && this.conteosCerrados().length === 0;

  constructor() {
    addIcons({ alertCircleOutline, checkmarkDoneOutline, cloudUploadOutline, createOutline, refreshOutline, timeOutline });
  }

  // Conteos que pertenecen a un cierre — por relación (cierreId), no por snapshot guardado.
  tagsDelCierre(conteo: { id: number }): ReturnType<TagsMockStore['tagsDeCierre']> {
    return this.tagsStore.tagsDeCierre(conteo.id);
  }

  contadosDe(conteo: { id: number }): number {
    return this.tagsStore.contadosDeCierre(conteo.id);
  }

  // Resuelven tag/zona desde sod_ubicacion (mock) por id — el conteo no los lleva propios.
  codigoDe(tag: { ubicacionId: number }): string {
    return this.tagsStore.obtenerUbicacion(tag.ubicacionId)?.tag ?? '';
  }

  zonaDe(tag: { ubicacionId: number }): string {
    return this.tagsStore.obtenerUbicacion(tag.ubicacionId)?.zonaCodigo ?? '';
  }

  reintentar(ubicacionId: number): void {
    this.tagsStore.reintentar(ubicacionId);
  }

  onSegmentChange(event: Event): void {
    const value = (event as CustomEvent<{ value: string | number }>).detail.value;
    this.conteoSeleccionadoId.set(Number(value));
  }

  // Solo disponible para tags Pendiente — un TAG ya Enviado no se puede reabrir.
  editarTag(ubicacionId: number): void {
    const tag = this.tagsStore.tags().find((t) => t.ubicacionId === ubicacionId);
    if (!tag) return;
    const ubicacion = this.tagsStore.obtenerUbicacion(ubicacionId);
    const zona      = ZONAS_MOCK.find((z) => z.codigo === ubicacion?.zonaCodigo) ?? ZONAS_MOCK[0];
    this.tagSesion.iniciar(ubicacion?.tag ?? '', zona, tag.items);
    this.router.navigate(['/counting']);
  }

  async finalizarConteo(): Promise<void> {
    if (!this.todosEnviados()) return;

    const esReconteo = this.modoActual() === 'RECONTEO';
    const alert = await this.alertController.create({
      header:  esReconteo ? 'Finalizar reconteo' : 'Finalizar conteo',
      message: `Contados ${this.totalContados()} de ${this.totalMuestra()} productos${this.totalFaltantes() > 0 ? ` (${this.totalFaltantes()} sin contar)` : ''}. Esta acción no se puede deshacer. ¿Confirmas?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Finalizar', role: 'confirm', handler: () => { void this.doFinalizarConteo(esReconteo); } },
      ],
    });
    await alert.present();
  }

  private async doFinalizarConteo(esReconteo: boolean): Promise<void> {
    this.tagsStore.archivarConteoActual();

    const toast = await this.toastController.create({
      message:  esReconteo ? 'Reconteo finalizado — todos los TAGs sincronizados' : 'Conteo finalizado — todos los TAGs sincronizados',
      duration: 2500,
      color:    'success',
      position: 'top',
    });
    await toast.present();
    this.router.navigate(['/home']);
  }
}
