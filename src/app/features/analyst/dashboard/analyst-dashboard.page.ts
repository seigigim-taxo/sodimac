import { Component, inject, signal, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  IonButtons,
  IonContent,
  IonHeader,
  IonMenuButton,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone';
import { AuthFacade } from '../../../state/auth/auth.facade';
import { AnalystDashboardFacade } from '../../../state/analyst/analyst-dashboard.facade';
import { FilaAnalista, TagAnalista } from '../../../domain/sincronizacion/models/preparacion.model';

@Component({
  selector: 'app-analyst-dashboard',
  templateUrl: './analyst-dashboard.page.html',
  styleUrls: ['./analyst-dashboard.page.scss'],
  standalone: true,
  imports: [
    DecimalPipe,
    FormsModule,
    IonButtons,
    IonContent,
    IonHeader,
    IonMenuButton,
    IonTitle,
    IonToolbar,
  ],
})
export class AnalystDashboardPage {
  private router = inject(Router);
  private auth = inject(AuthFacade);
  private dashboard = inject(AnalystDashboardFacade);
  private toastController = inject(ToastController);

  usuario = this.auth.session;

  contexto = this.dashboard.contexto;
  kpis = this.dashboard.kpis;
  filas = this.dashboard.filas;
  registros = this.dashboard.registros;
  registrosEnviados = this.dashboard.registrosEnviados;
  registrosPendientes = this.dashboard.registrosPendientes;

  filtroBusqueda = signal('');
  filtroZona = signal('TODAS');
  filtroEstado = signal('TODOS');

  modalAbierto = signal(false);
  filaSeleccionada = signal<FilaAnalista | null>(null);
  tagSeleccionado = signal<TagAnalista | null>(null);
  cantidadAnalista = signal<number>(0);
  enviando = signal(false);

  zonasDisponibles = computed(() => {
    const todas = this.filas().map(f => f.zona).filter(z => z);
    return [...new Set(todas)];
  });

  estadosDisponibles = computed(() => {
    const todos = this.filas().map(f => f.estado).filter(e => e);
    return [...new Set(todos)];
  });

  filasFiltradas = computed(() => {
    let resultado = [...this.filas()];
    const busqueda = this.filtroBusqueda().toLowerCase().trim();
    const zona = this.filtroZona();
    const estado = this.filtroEstado();

    if (busqueda) {
      resultado = resultado.filter(f =>
        f.sku.toLowerCase().includes(busqueda) ||
        (f.descripcion ?? '').toLowerCase().includes(busqueda) ||
        f.tag.toLowerCase().includes(busqueda)
      );
    }

    if (zona !== 'TODAS') {
      resultado = resultado.filter(f => f.zona === zona);
    }

    if (estado !== 'TODOS') {
      resultado = resultado.filter(f => f.estado === estado);
    }

    return resultado;
  });

  formatearValor(valor: number): string {
    if (valor >= 1000000) {
      return `$${(valor / 1000000).toFixed(2)} MM`;
    }
    return valor.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
  }

  formatearFecha(iso: string): string {
    if (!iso) return '';
    const [anio, mes, dia] = iso.split('-');
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${dia} de ${meses[parseInt(mes, 10) - 1]} de ${anio}`;
  }

  limpiarFiltros(): void {
    this.filtroBusqueda.set('');
    this.filtroZona.set('TODAS');
    this.filtroEstado.set('TODOS');
  }

  irAHome(): void {
    this.router.navigate(['/home']);
  }

  abrirModal(fila: FilaAnalista): void {
    this.filaSeleccionada.set(fila);
    this.tagSeleccionado.set(null);
    this.cantidadAnalista.set(0);
    this.modalAbierto.set(true);
  }

  cerrarModal(): void {
    this.modalAbierto.set(false);
    this.filaSeleccionada.set(null);
    this.tagSeleccionado.set(null);
    this.cantidadAnalista.set(0);
  }

  seleccionarTag(tag: TagAnalista): void {
    this.tagSeleccionado.set(tag);
    this.cantidadAnalista.set(0);
  }

  onCantidadChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.cantidadAnalista.set(Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
  }

  async registrarConteo(): Promise<void> {
    const fila = this.filaSeleccionada();
    const tag = this.tagSeleccionado();
    const cantidad = this.cantidadAnalista();

    if (!fila || !tag || cantidad <= 0) return;

    this.enviando.set(true);
    try {
      const ok = await this.dashboard.registrarConteo(
        fila, tag.tagCodigo, tag.ubicacionCodigo, tag.zonaNombre, cantidad
      );
      if (ok) {
        await this.avisar(`Conteo registrado: ${fila.sku} × ${cantidad} en ${tag.ubicacionCodigo}`, 'success');
        this.cerrarModal();
      } else {
        await this.avisar('Error al enviar el conteo al servidor', 'danger');
      }
    } finally {
      this.enviando.set(false);
    }
  }

  private async avisar(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 3000, color, position: 'top' });
    await toast.present();
  }
}
