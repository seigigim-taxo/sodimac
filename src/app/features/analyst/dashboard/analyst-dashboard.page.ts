import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButtons,
  IonContent,
  IonHeader,
  IonMenuButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { AuthFacade } from '../../../state/auth/auth.facade';
import { AnalystDashboardFacade } from '../../../state/analyst/analyst-dashboard.facade';
import { ValidacionBloqueAnalista } from '../../../domain/sincronizacion/models/preparacion.model';

export type StageStatus = 'COMPLETADO' | 'PENDIENTE' | 'BLOQUEADO';
export type MetricTone = 'neutral' | 'ok' | 'warning' | 'danger' | 'purple';
export type SearchMode = 'TAG' | 'SKU';

export interface StageMetric {
  label: string;
  value: string | number;
  hint?: string;
  tone?: MetricTone;
}

export interface StagePreviewRow {
  main: string;
  secondary: string;
  status: StageStatus;
}

export interface Stage {
  id: string;
  label: string;
  title: string;
  description: string;
  objective: string;
  status: StageStatus;
  badge?: string;
  metrics: StageMetric[];
  actionLabel?: string;
  lockedReason?: string;
  previewRows: StagePreviewRow[];
}

export interface OperationalProduct {
  sku: string;
  product: string;
  quantity: number;
  newQuantity: number;
  status: 'CONFIRMADO' | 'PENDIENTE';
}

export interface OperationalModalData {
  stageId: 'altillos' | 'punto-venta';
  title: string;
  subtitle: string;
  searchValue: string;
  tagTitle: string;
  tagDescription: string;
  productCount: string;
  confirmedCount: number;
  pendingCount: number;
  products: OperationalProduct[];
}

export interface PreVarianceLocation {
  origin: string;
  zone: string;
  tag: string;
  quantity: number;
  newQuantity: number;
  status: 'CONFIRMADO' | 'PENDIENTE';
}

export interface PreVarianceModalData {
  title: string;
  subtitle: string;
  sku: string;
  product: string;
  kardex: number;
  unitCost: string;
  currentDifference: string;
  locations: PreVarianceLocation[];
}

export interface RecountRow {
  sku: string;
  product: string;
  physical: number;
  theoretical: number;
  unitDifference: number;
  unitCost: string;
  costDifference: string;
  status: string;
}

export interface RecountModalData {
  title: string;
  subtitle: string;
  remaining: number;
  recounted: number;
  countNumber: number;
  largestDifference: string;
  rows: RecountRow[];
}

@Component({
  selector: 'app-analyst-dashboard',
  templateUrl: './analyst-dashboard.page.html',
  styleUrls: ['./analyst-dashboard.page.scss'],
  standalone: true,
  imports: [
    IonButtons,
    IonContent,
    IonHeader,
    IonMenuButton,
    IonTitle,
    IonToolbar,
  ],
})
export class AnalystDashboardPage implements OnInit {
  private router = inject(Router);
  private auth = inject(AuthFacade);
  private dashboard = inject(AnalystDashboardFacade);

  usuario = this.auth.session;

  altillosStage = computed<Stage>(() => {
    const altillos = this.dashboard.altillos();
    if (!altillos) {
      return {
        id: 'altillos',
        label: '1.2',
        title: 'Altillos - 100%',
        description: 'Todos los TAG de Altillo utilizados deben ser revisados.',
        objective: 'Puede validar buscando por TAG o por SKU.',
        status: 'PENDIENTE',
        badge: '0%',
        actionLabel: 'Abrir validación',
        metrics: [
          { label: 'TAG usados', value: 0, hint: 'Universo a revisar', tone: 'neutral' },
          { label: 'Objetivo mínimo', value: '100%', hint: '100%', tone: 'ok' },
          { label: 'Confirmados', value: 0, hint: 'TAG completamente confirmados', tone: 'ok' },
          { label: 'Pendientes', value: 0, hint: 'TAG aún incompletos', tone: 'ok' },
          { label: 'Avance', value: '0%', hint: 'Sin datos', tone: 'neutral' },
        ],
        previewRows: [],
      };
    }

    const r = altillos.resumen;
    const status: StageStatus = r.cumple ? 'COMPLETADO' : 'PENDIENTE';
    const badge = r.cumple ? 'CUMPLE' : `${r.porcentaje}%`;
    const actionLabel = r.cumple ? 'Ver validación' : 'Abrir validación';

    return {
      id: 'altillos',
      label: '1.2',
      title: 'Altillos - 100%',
      description: 'Todos los TAG de Altillo utilizados deben ser revisados.',
      objective: 'Puede validar buscando por TAG o por SKU.',
      status,
      badge,
      actionLabel,
      metrics: [
        { label: 'TAG usados', value: r.tagsUsados, hint: 'Universo a revisar', tone: 'neutral' },
        { label: 'Objetivo mínimo', value: r.objetivoPorcentaje, hint: '100%', tone: 'ok' },
        { label: 'Confirmados', value: r.tagsConfirmados, hint: 'TAG completamente confirmados', tone: 'ok' },
        { label: 'Pendientes', value: r.tagsPendientes, hint: 'TAG aún incompletos', tone: r.tagsPendientes > 0 ? 'warning' : 'ok' },
        { label: 'Avance', value: `${r.porcentaje}%`, hint: r.cumple ? 'Objetivo cumplido' : 'Objetivo aún no cumplido', tone: r.cumple ? 'ok' : 'warning' },
      ],
      previewRows: altillos.tags.map(t => ({
        main: `TAG ${t.numeroTag ?? ''}`,
        secondary: t.nombreZona || t.codigoZona || 'ALTILLO',
        status: t.estadoValidacion === 'CONFIRMADO' ? 'COMPLETADO' as StageStatus : 'PENDIENTE' as StageStatus,
      })),
    };
  });

  puntoVentaStage = computed<Stage>(() => {
    const pv = this.dashboard.puntoVenta();
    if (!pv) {
      return {
        id: 'punto-venta',
        label: '1.3',
        title: 'Punto de Venta - mínimo 30%',
        description: 'El Analista elige los TAG a revisar; el sistema controla el mínimo.',
        objective: 'Puede validar buscando por TAG o por SKU.',
        status: 'PENDIENTE',
        badge: '0%',
        actionLabel: 'Abrir validación',
        metrics: [
          { label: 'TAG usados', value: 0, hint: 'Universo a revisar', tone: 'neutral' },
          { label: 'Objetivo mínimo', value: '30%', hint: '30%', tone: 'warning' },
          { label: 'Confirmados', value: 0, hint: 'TAG completamente confirmados', tone: 'ok' },
          { label: 'Pendientes', value: 0, hint: 'TAG aún incompletos', tone: 'ok' },
          { label: 'Avance', value: '0%', hint: 'Sin datos', tone: 'neutral' },
        ],
        previewRows: [],
      };
    }

    const r = pv.resumen;
    const status: StageStatus = r.cumple ? 'COMPLETADO' : 'PENDIENTE';
    const badge = r.cumple ? 'CUMPLE' : `${r.porcentaje}%`;
    const actionLabel = r.cumple ? 'Ver validación' : 'Abrir validación';

    return {
      id: 'punto-venta',
      label: '1.3',
      title: 'Punto de Venta - mínimo 30%',
      description: 'El Analista elige los TAG a revisar; el sistema controla el mínimo.',
      objective: 'Puede validar buscando por TAG o por SKU.',
      status,
      badge,
      actionLabel,
      metrics: [
        { label: 'TAG usados', value: r.tagsUsados, hint: 'Universo a revisar', tone: 'neutral' },
        { label: 'Objetivo mínimo', value: r.objetivoPorcentaje, hint: '30%', tone: 'warning' },
        { label: 'Confirmados', value: r.tagsConfirmados, hint: 'TAG completamente confirmados', tone: 'ok' },
        { label: 'Pendientes', value: r.tagsPendientes, hint: 'TAG aún incompletos', tone: r.tagsPendientes > 0 ? 'warning' : 'ok' },
        { label: 'Avance', value: `${r.porcentaje}%`, hint: r.cumple ? 'Objetivo cumplido' : 'Objetivo aún no cumplido', tone: r.cumple ? 'ok' : 'warning' },
      ],
      previewRows: pv.tags.map(t => ({
        main: `TAG ${t.numeroTag ?? ''}`,
        secondary: t.nombreZona || t.codigoZona || 'PUNTO DE VENTA',
        status: t.estadoValidacion === 'CONFIRMADO' ? 'COMPLETADO' as StageStatus : 'PENDIENTE' as StageStatus,
      })),
    };
  });

  preVarianceStage = computed<Stage>(() => {
    const pv = this.dashboard.preVariance();
    if (!pv || pv.productos.length === 0) {
      return {
        id: 'pre-variance',
        label: '2.1',
        title: 'Pre Variance',
        description: 'Diferencia valorizada absoluta mayor a $500.000.',
        objective: 'Revisión contra Kardex.',
        status: 'PENDIENTE',
        badge: '0',
        actionLabel: 'Revisar Pre Variance',
        metrics: [
          { label: 'SKU en Pre Variance', value: 0, hint: 'Diferencia valorizada > $500.000', tone: 'neutral' },
          { label: 'Diferencia valorizada', value: '$0', hint: 'Total con signo', tone: 'neutral' },
          { label: 'Revisados / pendientes', value: '0 / 0', hint: 'Revisión Analista Sodimac', tone: 'neutral' },
        ],
        previewRows: [],
      };
    }

    const r = pv.resumen;
    const status: StageStatus = r.skuPendientes === 0 ? 'COMPLETADO' : 'PENDIENTE';
    const badge = r.skuRevisados > 0 ? `${r.skuRevisados}/${r.skuTotal}` : `${r.skuTotal}`;
    const actionLabel = r.skuPendientes === 0 ? 'Ver Pre Variance' : 'Revisar Pre Variance';

    const formatCurrency = (v: number): string => {
      const abs = Math.abs(v);
      const formatted = abs.toLocaleString('es-CL');
      return v < 0 ? `-$${formatted}` : `$${formatted}`;
    };

    return {
      id: 'pre-variance',
      label: '2.1',
      title: 'Pre Variance',
      description: 'Diferencia valorizada absoluta mayor a $500.000.',
      objective: 'Revisión contra Kardex.',
      status,
      badge,
      actionLabel,
      metrics: [
        { label: 'SKU en Pre Variance', value: r.skuTotal, hint: 'Diferencia valorizada > $500.000', tone: 'neutral' },
        { label: 'Diferencia valorizada', value: formatCurrency(r.diferenciaTotal), hint: 'Total con signo', tone: r.skuPendientes > 0 ? 'danger' : 'ok' },
        { label: 'Revisados / pendientes', value: `${r.skuRevisados} / ${r.skuPendientes}`, hint: 'Revisión Analista Sodimac', tone: r.skuPendientes > 0 ? 'warning' : 'ok' },
      ],
      previewRows: pv.productos.slice(0, 5).map(p => ({
        main: p.sku,
        secondary: p.descripcion ?? p.sku,
        status: p.estadoPreVariance === 'REVISADO' ? 'COMPLETADO' as StageStatus : 'PENDIENTE' as StageStatus,
      })),
    };
  });

  ngOnInit(): void {
    this.dashboard.cargarAltillosDesdeLocal();
    this.dashboard.cargarPuntoVentaDesdeLocal();
    this.dashboard.cargarPreVarianceDesdeLocal();
  }

  etapa1Label = 'ETAPA 1 - Validación operacional';
  etapa1Objetivo = 'Comprobar la ejecución física realizada por Taxo. El Analista puede entrar por TAG o por SKU. Se muestra la cantidad inventariada para confirmarla o modificarla; no se muestra Kardex, teórico ni valorización.';
  etapa1Route = 'ZONIFICACIÓN > ALTILLOS 100% > PDV MÍNIMO 30%';

  etapa2Label = 'ETAPA 2 - Validación contra Kardex';
  etapa2Objetivo = 'Revisar diferencias entre el físico vigente y Kardex. Desde aquí sí se muestra teórico, costo y diferencia valorizada.';
  etapa2Route = 'PRE VARIANCE > RECUENTO';

  etapa1 = computed<Stage[]>(() => [
    this.altillosStage(),
    this.puntoVentaStage(),
  ]);

  etapa2 = computed<Stage[]>(() => [
    this.preVarianceStage(),
    {
      id: 'recuento',
      label: '2.2',
      title: 'Recuento',
      description: 'Por defecto muestra diferencias no abordadas en Pre Variance. Puede ampliar a todas las diferencias.',
      objective: 'El resultado se registra como Conteo 3.',
      status: 'PENDIENTE',
      actionLabel: 'Abrir recuento',
      metrics: [
        { label: 'Restantes', value: 0, hint: 'Diferencias por revisar', tone: 'neutral' },
        { label: 'Recontados', value: 0, hint: 'Aún sin recuento', tone: 'neutral' },
        { label: 'Conteo', value: 3, hint: 'Registro resultante', tone: 'purple' },
      ],
      previewRows: [],
    },
  ]);

  private construirAltillosModalData(): OperationalModalData {
    const altillos = this.dashboard.altillos();
    if (!altillos || altillos.tags.length === 0) {
      return {
        stageId: 'altillos',
        title: 'Validación operacional - Analista Sodimac',
        subtitle: 'Altillos 100% - busque por TAG o SKU.',
        searchValue: '',
        tagTitle: 'Sin TAG disponibles',
        tagDescription: 'No hay datos de Altillos para esta jornada.',
        productCount: '0 productos',
        confirmedCount: 0,
        pendingCount: 0,
        products: [],
      };
    }

    const primerTag = altillos.tags[0];
    const productosDelTag = altillos.productos.filter(p => p.numeroTag === primerTag.numeroTag);

    return {
      stageId: 'altillos',
      title: 'Validación operacional - Analista Sodimac',
      subtitle: 'Altillos 100% - busque por TAG o SKU.',
      searchValue: String(primerTag.numeroTag ?? ''),
      tagTitle: `TAG ${primerTag.numeroTag ?? ''} - ${primerTag.nombreZona || primerTag.codigoZona || 'ALTILLO'}`,
      tagDescription: 'Lista completa de productos contados dentro del TAG.',
      productCount: `${productosDelTag.length} producto${productosDelTag.length !== 1 ? 's' : ''}`,
      confirmedCount: productosDelTag.filter(p => p.estadoValidacion === 'CONFIRMADO').length,
      pendingCount: productosDelTag.filter(p => p.estadoValidacion === 'PENDIENTE').length,
      products: productosDelTag.map(p => ({
        sku: p.sku,
        product: p.descripcion ?? p.sku,
        quantity: p.cantidadInventariada,
        newQuantity: p.cantidadAnalista ?? p.cantidadInventariada,
        status: p.estadoValidacion === 'CONFIRMADO' ? 'CONFIRMADO' as const : 'PENDIENTE' as const,
      })),
    };
  }

  private construirPuntoVentaModalData(): OperationalModalData {
    const pv = this.dashboard.puntoVenta();
    if (!pv || pv.tags.length === 0) {
      return {
        stageId: 'punto-venta',
        title: 'Validación operacional - Analista Sodimac',
        subtitle: 'Punto de Venta 30% - busque por TAG o SKU.',
        searchValue: '',
        tagTitle: 'Sin TAG disponibles',
        tagDescription: 'No hay datos de Punto de Venta para esta jornada.',
        productCount: '0 productos',
        confirmedCount: 0,
        pendingCount: 0,
        products: [],
      };
    }

    const primerTag = pv.tags[0];
    const productosDelTag = pv.productos.filter(p => p.numeroTag === primerTag.numeroTag);

    return {
      stageId: 'punto-venta',
      title: 'Validación operacional - Analista Sodimac',
      subtitle: 'Punto de Venta 30% - busque por TAG o SKU.',
      searchValue: String(primerTag.numeroTag ?? ''),
      tagTitle: `TAG ${primerTag.numeroTag ?? ''} - ${primerTag.nombreZona || primerTag.codigoZona || 'PUNTO DE VENTA'}`,
      tagDescription: 'Lista completa de productos contados dentro del TAG.',
      productCount: `${productosDelTag.length} producto${productosDelTag.length !== 1 ? 's' : ''}`,
      confirmedCount: productosDelTag.filter(p => p.estadoValidacion === 'CONFIRMADO').length,
      pendingCount: productosDelTag.filter(p => p.estadoValidacion === 'PENDIENTE').length,
      products: productosDelTag.map(p => ({
        sku: p.sku,
        product: p.descripcion ?? p.sku,
        quantity: p.cantidadInventariada,
        newQuantity: p.cantidadAnalista ?? p.cantidadInventariada,
        status: p.estadoValidacion === 'CONFIRMADO' ? 'CONFIRMADO' as const : 'PENDIENTE' as const,
      })),
    };
  }

  stageExpanded = signal<string | null>(null);
  operationalModal = signal<OperationalModalData | null>(null);
  preVarianceModal = signal<PreVarianceModalData | null>(null);
  recountModal = signal<RecountModalData | null>(null);
  searchMode = signal<SearchMode>('TAG');
  showAddSku = signal(false);

  private construirPreVarianceModalData(): PreVarianceModalData | null {
    const pv = this.dashboard.preVariance();
    if (!pv || pv.productos.length === 0) return null;

    const primerSku = pv.productos.find(p => p.estadoPreVariance === 'PENDIENTE') ?? pv.productos[0];

    const formatCurrency = (v: number): string => {
      const abs = Math.abs(v);
      const formatted = abs.toLocaleString('es-CL');
      return v < 0 ? `-$${formatted}` : `$${formatted}`;
    };

    return {
      title: 'Revisión de Pre Variance - Analista Sodimac',
      subtitle: `${primerSku.sku} - ${primerSku.descripcion ?? primerSku.sku}`,
      sku: primerSku.sku,
      product: primerSku.descripcion ?? primerSku.sku,
      kardex: primerSku.stockTeorico,
      unitCost: formatCurrency(primerSku.valorUnitario),
      currentDifference: formatCurrency(primerSku.diferenciaEnCosto),
      locations: primerSku.ubicaciones.map(u => ({
        origin: 'Contado',
        zone: u.zona,
        tag: String(u.numeroTag ?? ''),
        quantity: u.cantidadInventariada,
        newQuantity: u.cantidadPreVariance ?? u.cantidadInventariada,
        status: u.cantidadPreVariance !== null ? 'CONFIRMADO' as const : 'PENDIENTE' as const,
      })),
    };
  }

  private recountModalData: RecountModalData = {
    title: 'Recuento - Analista Sodimac',
    subtitle: 'Diferencias restantes para Conteo 3',
    remaining: 15,
    recounted: 0,
    countNumber: 3,
    largestDifference: '-$307.472',
    rows: [
      { sku: '7576331', product: 'DETERGENTE EN LAMINAS DEKAP CR', physical: 0, theoretical: 88, unitDifference: -88, unitCost: '$3.494', costDifference: '-$307.472', status: 'PENDIENTE 0 TAG' },
      { sku: '3948056', product: 'DETERGENTE LIQUIDO 10 LTS KW', physical: 69, theoretical: 82, unitDifference: -13, unitCost: '$9.453', costDifference: '-$122.889', status: 'PENDIENTE 3 TAG' },
      { sku: '7712227', product: 'DETERGENTE HIPO 3 L DOYPACK', physical: 2, theoretical: 13, unitDifference: -11, unitCost: '$11.123', costDifference: '-$122.353', status: 'PENDIENTE 1 TAG' },
      { sku: '7361750', product: 'DETERGENTE KLEINE RECARGA 3LT', physical: 1, theoretical: 35, unitDifference: -34, unitCost: '$3.147', costDifference: '-$106.998', status: 'PENDIENTE 1 TAG' },
      { sku: '8823006', product: 'DETERGENTE POLVO KLEINE 10KG', physical: 50, theoretical: 65, unitDifference: -15, unitCost: '$7.050', costDifference: '-$105.750', status: 'PENDIENTE 2 TAG' },
    ],
  };

  toggleStage(stageId: string): void {
    const current = this.stageExpanded();
    this.stageExpanded.set(current === stageId ? null : stageId);
  }

  isStageUnlocked(stage: Stage): boolean {
    return stage.status !== 'BLOQUEADO';
  }

  getStageStatusClass(status: StageStatus): string {
    switch (status) {
      case 'COMPLETADO':
        return 'status-ok';
      case 'PENDIENTE':
        return 'status-pending';
      case 'BLOQUEADO':
        return 'status-locked';
    }
  }

  getStageStatusLabel(status: StageStatus): string {
    switch (status) {
      case 'COMPLETADO':
        return 'CUMPLE';
      case 'PENDIENTE':
        return 'PENDIENTE';
      case 'BLOQUEADO':
        return 'BLOQUEADO';
    }
  }

  getMetricToneClass(tone?: MetricTone): string {
    switch (tone) {
      case 'ok':
        return 'stage-metric--ok';
      case 'warning':
        return 'stage-metric--warning';
      case 'danger':
        return 'stage-metric--danger';
      case 'purple':
        return 'stage-metric--purple';
      default:
        return '';
    }
  }

  abrirValidacion(stage: Stage): void {
    if (!this.isStageUnlocked(stage)) return;
    if (stage.id === 'altillos') {
      this.operationalModal.set(this.construirAltillosModalData());
      this.searchMode.set('TAG');
      this.showAddSku.set(false);
    } else if (stage.id === 'punto-venta') {
      this.operationalModal.set(this.construirPuntoVentaModalData());
      this.searchMode.set('TAG');
      this.showAddSku.set(false);
    } else if (stage.id === 'pre-variance') {
      const pvData = this.construirPreVarianceModalData();
      if (pvData) {
        this.preVarianceModal.set(pvData);
      }
    } else if (stage.id === 'recuento') {
      this.recountModal.set(this.recountModalData);
    }
  }

  closeOperationalModal(): void {
    this.operationalModal.set(null);
    this.showAddSku.set(false);
  }

  closePreVarianceModal(): void {
    this.preVarianceModal.set(null);
  }

  closeRecountModal(): void {
    this.recountModal.set(null);
  }

  setSearchMode(mode: SearchMode): void {
    this.searchMode.set(mode);
  }

  toggleAddSku(): void {
    this.showAddSku.update(v => !v);
  }

  irAHome(): void {
    this.router.navigate(['/home']);
  }
}
