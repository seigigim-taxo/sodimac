import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { searchOutline } from 'ionicons/icons';
import {
  ACTIVIDAD_MOCK,
  DIFERENCIAS_MOCK,
  DiferenciaItem,
  EstadoDiferencia,
  INDICADORES_MOCK,
  JORNADA_MOCK,
  PRIORIDAD_ZONA_MOCK,
  PrioridadDiferencia,
  ZONAS_MOCK,
} from './dashboard.mock';

type Orden = 'IMPACTO' | 'UNIDADES' | 'ZONA';

/*
 * Cuadro de mando del analista. MAQUETA: los datos salen de dashboard.mock.ts,
 * no de SQLite. Los filtros sí funcionan de verdad sobre esa lista, para poder
 * validar la interacción con el negocio antes de cablear el repositorio.
 *
 * Pensada para tablet: el ancho útil llega a 1280px y la rejilla colapsa a una
 * columna en teléfono. La tabla de diferencias se vuelve tarjetas bajo `md`,
 * porque una tabla de 9 columnas no es legible en vertical.
 */
@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  standalone: true,
  imports: [
    FormsModule,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonMenuButton,
    IonTitle,
    IonToolbar,
  ],
})
export class DashboardPageComponent {
  jornada = JORNADA_MOCK;
  zonas = ZONAS_MOCK;
  actividad = ACTIVIDAD_MOCK;

  zonaActiva = signal(ZONAS_MOCK[0]);

  // ----- Filtros de la cola de diferencias -----
  busqueda = signal('');
  filtroZona = signal<string>('TODAS');
  filtroEstado = signal<EstadoDiferencia | 'TODOS'>('TODOS');
  orden = signal<Orden>('IMPACTO');
  soloCriticas = signal(false);

  private diferencias = signal<DiferenciaItem[]>(DIFERENCIAS_MOCK);

  diferenciasFiltradas = computed(() => {
    const texto = this.busqueda().trim().toLowerCase();
    const zona = this.filtroZona();
    const estado = this.filtroEstado();
    const criticas = this.soloCriticas();

    const filtradas = this.diferencias().filter((d) => {
      if (criticas && d.estado !== 'CRITICA') return false;
      if (zona !== 'TODAS' && d.zona !== zona) return false;
      if (estado !== 'TODOS' && d.estado !== estado) return false;
      if (!texto) return true;
      return (
        d.sku.toLowerCase().includes(texto) ||
        d.producto.toLowerCase().includes(texto) ||
        d.tag.toLowerCase().includes(texto)
      );
    });

    return this.ordenar(filtradas, this.orden());
  });

  hayFiltrosActivos = computed(
    () =>
      this.busqueda().trim() !== '' ||
      this.filtroZona() !== 'TODAS' ||
      this.filtroEstado() !== 'TODOS' ||
      this.soloCriticas()
  );

  // ----- Indicadores del evento completo -----
  indicadores = INDICADORES_MOCK;

  porcentajeResueltas =
    INDICADORES_MOCK.recontosRealizados === 0
      ? 0
      : Math.round(
          (INDICADORES_MOCK.diferenciasResueltas / INDICADORES_MOCK.recontosRealizados) * 100
        );

  prioridadZona = PRIORIDAD_ZONA_MOCK;
  /* Las barras se dibujan relativas al mayor, no a la suma. */
  private montoMayorZona = Math.max(...PRIORIDAD_ZONA_MOCK.map((z) => z.monto));

  constructor() {
    addIcons({ searchOutline });
  }

  anchoBarra(monto: number): string {
    return `${Math.round((monto / this.montoMayorZona) * 100)}%`;
  }

  /* 1_248_000 → "1,25 MM". Los montos grandes en pesos no caben en una KPI. */
  enMillones(monto: number): string {
    return (monto / 1_000_000).toFixed(2).replace('.', ',');
  }

  /*
   * Formato chileno con punto de miles. Se hace acá y no con DecimalPipe porque
   * la app no registra LOCALE_ID es-CL: el pipe entregaría "1,248,000".
   */
  pesos(monto: number): string {
    return `$${monto.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`;
  }

  claseBadgePrioridad(prioridad: PrioridadDiferencia): string {
    switch (prioridad) {
      case 'ALTA':
        return 'badge-error';
      case 'MEDIA':
        return 'badge-warning';
      case 'BAJA':
        return 'badge';
    }
  }

  claseBadgeEstado(estado: EstadoDiferencia): string {
    switch (estado) {
      case 'CRITICA':
        return 'badge-error';
      case 'PENDIENTE':
        return 'badge-warning';
      case 'RESUELTA':
        return 'badge-success';
    }
  }

  private static readonly ESTADO_LABELS: Record<EstadoDiferencia, string> = {
    CRITICA: 'Crítica',
    PENDIENTE: 'Pendiente',
    RESUELTA: 'Resuelta',
  };

  etiquetaEstado(estado: EstadoDiferencia): string {
    return DashboardPageComponent.ESTADO_LABELS[estado];
  }

  limpiarFiltros(): void {
    this.busqueda.set('');
    this.filtroZona.set('TODAS');
    this.filtroEstado.set('TODOS');
    this.orden.set('IMPACTO');
    this.soloCriticas.set(false);
  }

  alternarSoloCriticas(): void {
    this.soloCriticas.update((v) => !v);
  }

  recontar(item: DiferenciaItem): void {
    // Maqueta: el destino de esta acción todavía no está definido.
    console.info('[dashboard] recontar SKU', item.sku, 'en', item.zona);
  }

  private ordenar(items: DiferenciaItem[], orden: Orden): DiferenciaItem[] {
    const copia = [...items];
    switch (orden) {
      case 'IMPACTO':
        return copia.sort((a, b) => b.difMonto - a.difMonto);
      case 'UNIDADES':
        return copia.sort((a, b) => Math.abs(b.difUnidades) - Math.abs(a.difUnidades));
      case 'ZONA':
        return copia.sort((a, b) => a.zona.localeCompare(b.zona));
    }
  }
}
