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
import { ValidacionBloqueAnalista, ValidacionProductoAnalista } from '../../../domain/sincronizacion/models/preparacion.model';

export type StageStatus = 'COMPLETADO' | 'PENDIENTE' | 'BLOQUEADO';
export type MetricTone = 'neutral' | 'ok' | 'warning' | 'danger' | 'purple';

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

export interface OperationalTagSummaryProduct {
  sku: string;
  product: string;
  c1Units: number;
  c2Units: string;
  status: StageStatus;
}

export interface OperationalTagSummaryRow {
  tag: string;
  c1Units: number;
  taxoOperator: string;
  c2Units: string;
  analyst: string;
  status: StageStatus;
  allProducts: OperationalTagSummaryProduct[];
  visibleProducts: OperationalTagSummaryProduct[];
  hiddenProductsCount: number;
}

export interface TagProductsModalData {
  tagNumber: string;
  products: OperationalTagSummaryProduct[];
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
  tagSummaryRows?: OperationalTagSummaryRow[];
  confirmedCount?: number;
  pendingCount?: number;
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
  confirmedLocations: number;
  pendingLocations: number;
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
  contexto = this.dashboard.contexto;

  altillosStage = computed<Stage>(() => {
    const altillos = this.dashboard.altillos();
    if (!altillos) {
      return {
        id: 'altillos',
        label: '1.1',
        title: 'Altillos - 100%',
        description: 'Todos los TAG de Altillo utilizados deben ser revisados.',
        objective: 'Puede validar buscando por TAG.',
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
      label: '1.1',
      title: 'Altillos - 100%',
      description: 'Todos los TAG de Altillo utilizados deben ser revisados.',
      objective: 'Puede validar buscando por TAG.',
      status,
      badge,
      actionLabel,
      confirmedCount: r.tagsConfirmados,
      pendingCount: r.tagsPendientes,
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
      tagSummaryRows: this.buildTagSummary(altillos),
    };
  });

  puntoVentaStage = computed<Stage>(() => {
    const pv = this.dashboard.puntoVenta();
    if (!pv) {
      return {
        id: 'punto-venta',
        label: '1.2',
        title: 'Punto de Venta - mínimo 30%',
        description: 'El Analista elige los TAG a revisar; el sistema controla el mínimo.',
        objective: 'Puede validar buscando por TAG.',
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
      label: '1.2',
      title: 'Punto de Venta - mínimo 30%',
      description: 'El Analista elige los TAG a revisar; el sistema controla el mínimo.',
      objective: 'Puede validar buscando por TAG.',
      status,
      badge,
      actionLabel,
      confirmedCount: r.tagsConfirmados,
      pendingCount: r.tagsPendientes,
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
      tagSummaryRows: this.buildTagSummary(pv),
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

  recuentoStage = computed<Stage>(() => {
    const rc = this.dashboard.recuento();
    if (!rc || rc.productos.length === 0) {
      return {
        id: 'recuento',
        label: '2.2',
        title: 'Recuento',
        description: 'Por defecto muestra diferencias no abordadas en Pre Variance. Puede ampliar a todas las diferencias.',
        objective: 'El resultado se registra como Conteo 3.',
        status: 'PENDIENTE',
        badge: '0',
        actionLabel: 'Abrir recuento',
        metrics: [
          { label: 'Restantes', value: 0, hint: 'Diferencias por revisar', tone: 'neutral' },
          { label: 'Recontados', value: 0, hint: 'Aún sin recuento', tone: 'neutral' },
          { label: 'Conteo', value: 3, hint: 'Registro resultante', tone: 'purple' },
        ],
        previewRows: [],
      };
    }

    const r = rc.resumen;
    const status: StageStatus = r.skuPendientes === 0 ? 'COMPLETADO' : 'PENDIENTE';
    const badge = r.skuRecontados > 0 ? `${r.skuRecontados}/${r.skuTotal}` : `${r.skuTotal}`;
    const actionLabel = r.skuPendientes === 0 ? 'Ver Recuento' : 'Abrir recuento';

    const formatCurrency = (v: number): string => {
      const abs = Math.abs(v);
      const formatted = abs.toLocaleString('es-CL');
      return v < 0 ? `-$${formatted}` : `$${formatted}`;
    };

    return {
      id: 'recuento',
      label: '2.2',
      title: 'Recuento',
      description: 'Por defecto muestra diferencias no abordadas en Pre Variance. Puede ampliar a todas las diferencias.',
      objective: 'El resultado se registra como Conteo 3.',
      status,
      badge,
      actionLabel,
      metrics: [
        { label: 'Restantes', value: r.skuPendientes, hint: 'Diferencias por revisar', tone: r.skuPendientes > 0 ? 'warning' : 'ok' },
        { label: 'Recontados', value: r.skuRecontados, hint: r.skuRecontados > 0 ? 'Con recuento' : 'Aún sin recuento', tone: r.skuRecontados > 0 ? 'ok' : 'neutral' },
        { label: 'Conteo', value: 3, hint: 'Registro resultante', tone: 'purple' },
      ],
      previewRows: rc.productos.slice(0, 5).map(p => ({
        main: p.sku,
        secondary: p.descripcion ?? p.sku,
        status: p.estadoRecuento === 'RECONTADO' ? 'COMPLETADO' as StageStatus : 'PENDIENTE' as StageStatus,
      })),
    };
  });

  ngOnInit(): void {
    this.dashboard.cargarAltillosDesdeLocal();
    this.dashboard.cargarPuntoVentaDesdeLocal();
    this.dashboard.cargarPreVarianceDesdeLocal();
    this.dashboard.cargarRecuentoDesdeLocal();
  }

  etapa1Label = 'ETAPA 1 - Validación operacional';
  etapa1Objetivo = 'Comprobar la ejecución física realizada por Taxo. El Analista entra por TAG. Se muestra la cantidad inventariada para confirmarla o modificarla; no se muestra Kardex, teórico ni valorización.';

  etapa2Label = 'ETAPA 2 - Validación contra Kardex';
  etapa2Objetivo = 'Revisar diferencias entre el físico vigente y Kardex. Desde aquí sí se muestra teórico, costo y diferencia valorizada.';

  etapa1 = computed<Stage[]>(() => [
    this.altillosStage(),
    this.puntoVentaStage(),
  ]);

  etapa2 = computed<Stage[]>(() => [
    this.preVarianceStage(),
    this.recuentoStage(),
  ]);

  private buildTagSummary(bloque: ValidacionBloqueAnalista): OperationalTagSummaryRow[] {
    const map = new Map<number, { numeroTag: number; c1: number; c2: number | null; productos: OperationalTagSummaryProduct[] }>();

    for (const p of bloque.productos) {
      const key = p.numeroTag ?? 0;
      const hasC2 = typeof p.cantidadAnalista === 'number';

      if (!map.has(key)) {
        map.set(key, {
          numeroTag: key,
          c1: 0,
          c2: null,
          productos: [],
        });
      }

      const entry = map.get(key)!;
      entry.c1 += p.cantidadInventariada;
      if (hasC2) {
        entry.c2 = (entry.c2 ?? 0) + (p.cantidadAnalista as number);
      }

      entry.productos.push({
        sku: p.sku,
        product: p.descripcion ?? p.sku,
        c1Units: p.cantidadInventariada,
        c2Units: hasC2 ? `${p.cantidadAnalista}` : '-',
        status: p.estadoValidacion === 'CONFIRMADO' ? 'COMPLETADO' : 'PENDIENTE',
      });
    }

    return Array.from(map.values()).map(v => {
      const all = v.productos;
      const allConfirmed = all.length > 0 && all.every(p => p.status === 'COMPLETADO');
      return {
        tag: String(v.numeroTag),
        c1Units: v.c1,
        taxoOperator: '-',
        c2Units: v.c2 !== null ? `${v.c2}` : '-',
        analyst: '-',
        status: allConfirmed ? 'COMPLETADO' : 'PENDIENTE',
        allProducts: all,
        visibleProducts: all.slice(0, 5),
        hiddenProductsCount: Math.max(0, all.length - 5),
      };
    });
  }

  private construirAltillosModalData(): OperationalModalData {
    return {
      stageId: 'altillos',
      title: 'Validación operacional - Analista Sodimac',
      subtitle: 'Altillos 100% - busque por TAG.',
    };
  }

  private construirPuntoVentaModalData(): OperationalModalData {
    return {
      stageId: 'punto-venta',
      title: 'Validación operacional - Analista Sodimac',
      subtitle: 'Punto de Venta 30% - busque por TAG.',
    };
  }

  stageExpanded = signal<string | null>(null);
  operationalModal = signal<OperationalModalData | null>(null);
  preVarianceModal = signal<PreVarianceModalData | null>(null);
  recountModal = signal<RecountModalData | null>(null);
  tagProductsModal = signal<TagProductsModalData | null>(null);
  operationalTagSearch = signal('');
  operationalSearchedTag = signal<string | null>(null);
  operationalProductSearch = signal('');
  showAddSku = signal(false);

  operationalSelections = signal<Map<string, { decision: 'CONFIRMAR' | 'MODIFICAR'; quantity: number }>>(new Map());
  operationalSaving = signal(false);
  operationalSaveError = signal<string | null>(null);

  operationalTagLabel = computed(() => {
    const modal = this.operationalModal();
    if (!modal) return 'Ingrese el TAG a validar';
    return modal.stageId === 'altillos'
      ? 'Ingrese el TAG de Altillo a validar'
      : 'Ingrese el TAG de Punto de Venta a validar';
  });

  operationalTagHint = computed(() => {
    const modal = this.operationalModal();
    if (!modal) return '';
    return modal.stageId === 'altillos'
      ? 'Ingrese el número completo del TAG de Altillo. Si cambia el TAG, el resultado anterior se limpia automáticamente.'
      : 'Ingrese el número completo del TAG de Punto de Venta. Si cambia el TAG, el resultado anterior se limpia automáticamente.';
  });

  tagResult = computed(() => {
    const modal = this.operationalModal();
    const searched = this.operationalSearchedTag();
    if (!modal || !searched) return null;

    const stageData = modal.stageId === 'altillos' ? this.dashboard.altillos() : this.dashboard.puntoVenta();
    if (!stageData) return null;

    const tag = stageData.tags.find(t => String(t.numeroTag ?? '').trim() === searched);
    if (!tag) return null;

    const allProducts = stageData.productos.filter(p => String(p.numeroTag ?? '').trim() === searched);
    const productFilter = this.operationalProductSearch().trim().toLowerCase();
    const filteredProducts = productFilter
      ? allProducts.filter(p =>
          (p.sku ?? '').toLowerCase().includes(productFilter) ||
          (p.descripcion ?? '').toLowerCase().includes(productFilter))
      : allProducts;

    const confirmed = filteredProducts.filter(p => p.estadoValidacion === 'CONFIRMADO').length;
    const pending = filteredProducts.length - confirmed;

    return {
      tagTitle: `TAG ${tag.numeroTag ?? ''} - ${tag.nombreZona || tag.codigoZona || (modal.stageId === 'altillos' ? 'ALTILLO' : 'PUNTO DE VENTA')}`,
      tagDescription: 'Lista completa de productos contados dentro del TAG.',
      productCount: `${allProducts.length} producto${allProducts.length !== 1 ? 's' : ''}`,
      confirmedCount: confirmed,
      pendingCount: pending,
      totalProducts: allProducts.length,
      visibleProducts: filteredProducts.length,
      tagNumeroTag: tag.numeroTag,
      tagIdTagBackend: tag.idTagBackend,
      products: filteredProducts.map(p => {
        const sel = this.operationalSelections().get(p.sku);
        const isSelected = !!sel;
        const selectionDecision = sel?.decision ?? null;
        const isEditingQuantity = selectionDecision === 'MODIFICAR';
        return {
          sku: p.sku,
          product: p.descripcion ?? p.sku,
          quantity: p.cantidadInventariada,
          newQuantity: sel ? sel.quantity : (p.cantidadAnalista ?? p.cantidadInventariada),
          status: p.estadoValidacion === 'CONFIRMADO' ? 'CONFIRMADO' as const : 'PENDIENTE' as const,
          idProductoBackend: p.idProductoBackend,
          isSelected,
          selectionDecision,
          isEditingQuantity,
        };
      }),
    };
  });

  operationalTagNotFound = computed(() => {
    return !!this.operationalSearchedTag() && !this.tagResult();
  });

  isAltillosModal = computed(() => {
    const modal = this.operationalModal();
    return modal?.stageId === 'altillos';
  });

  hasOperationalChanges = computed(() => {
    return this.operationalSelections().size > 0;
  });

  hasModifiedOperationalProducts = computed(() => {
    for (const sel of this.operationalSelections().values()) {
      if (sel.decision === 'MODIFICAR') return true;
    }
    return false;
  });

  private construirPreVarianceModalData(): PreVarianceModalData | null {
    const pv = this.dashboard.preVariance();
    if (!pv || pv.productos.length === 0) return null;

    const primerSku = pv.productos.find(p => p.estadoPreVariance === 'PENDIENTE') ?? pv.productos[0];

    const formatCurrency = (v: number): string => {
      const abs = Math.abs(v);
      const formatted = abs.toLocaleString('es-CL');
      return v < 0 ? `-$${formatted}` : `$${formatted}`;
    };

    const locations = primerSku.ubicaciones.map(u => ({
      origin: 'Contado',
      zone: u.zona,
      tag: String(u.numeroTag ?? ''),
      quantity: u.cantidadInventariada,
      newQuantity: u.cantidadPreVariance ?? u.cantidadInventariada,
      status: u.cantidadPreVariance !== null ? 'CONFIRMADO' as const : 'PENDIENTE' as const,
    }));

    return {
      title: 'Revisión de Pre Variance - Analista Sodimac',
      subtitle: `${primerSku.sku} - ${primerSku.descripcion ?? primerSku.sku}`,
      sku: primerSku.sku,
      product: primerSku.descripcion ?? primerSku.sku,
      kardex: primerSku.stockTeorico,
      unitCost: formatCurrency(primerSku.valorUnitario),
      currentDifference: formatCurrency(primerSku.diferenciaEnCosto),
      confirmedLocations: locations.filter(l => l.status === 'CONFIRMADO').length,
      pendingLocations: locations.filter(l => l.status === 'PENDIENTE').length,
      locations,
    };
  }

  private construirRecountModalData(): RecountModalData | null {
    const rc = this.dashboard.recuento();
    if (!rc || rc.productos.length === 0) return null;

    const primerSku = rc.productos.find(p => p.estadoRecuento === 'PENDIENTE') ?? rc.productos[0];

    const formatCurrency = (v: number): string => {
      const abs = Math.abs(v);
      const formatted = abs.toLocaleString('es-CL');
      return v < 0 ? `-$${formatted}` : `$${formatted}`;
    };

    return {
      title: 'Recuento - Analista Sodimac',
      subtitle: 'Diferencias restantes para Conteo 3',
      remaining: rc.resumen.skuPendientes,
      recounted: rc.resumen.skuRecontados,
      countNumber: 3,
      largestDifference: formatCurrency(rc.resumen.mayorDiferenciaValor),
      rows: rc.productos.map(p => ({
        sku: p.sku,
        product: p.descripcion ?? p.sku,
        physical: p.fisicoActual,
        theoretical: p.stockTeorico,
        unitDifference: p.diferenciaUnidades,
        unitCost: formatCurrency(p.valorUnitario),
        costDifference: formatCurrency(p.diferenciaEnCosto),
        status: p.estadoRecuento === 'RECONTADO' ? 'RECONTADO' : `PENDIENTE`,
      })),
    };
  }

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

  getTagStatusLabel(status: StageStatus): string {
    switch (status) {
      case 'COMPLETADO':
        return 'CONFIRMADO';
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
      this.operationalTagSearch.set('');
      this.operationalSearchedTag.set(null);
      this.operationalProductSearch.set('');
      this.showAddSku.set(false);
    } else if (stage.id === 'punto-venta') {
      this.operationalModal.set(this.construirPuntoVentaModalData());
      this.operationalTagSearch.set('');
      this.operationalSearchedTag.set(null);
      this.operationalProductSearch.set('');
      this.showAddSku.set(false);
    } else if (stage.id === 'pre-variance') {
      const pvData = this.construirPreVarianceModalData();
      if (pvData) {
        this.preVarianceModal.set(pvData);
      }
    } else if (stage.id === 'recuento') {
      const rcData = this.construirRecountModalData();
      if (rcData) {
        this.recountModal.set(rcData);
      }
    }
  }

  closeOperationalModal(): void {
    this.operationalModal.set(null);
    this.operationalTagSearch.set('');
    this.operationalSearchedTag.set(null);
    this.operationalProductSearch.set('');
    this.showAddSku.set(false);
    this.operationalSelections.set(new Map());
    this.operationalSaving.set(false);
    this.operationalSaveError.set(null);
  }

  updateOperationalTagSearch(value: string): void {
    this.operationalTagSearch.set(value);
    this.operationalSearchedTag.set(null);
    this.operationalProductSearch.set('');
    this.showAddSku.set(false);
    this.operationalSelections.set(new Map());
    this.operationalSaveError.set(null);
  }

  searchOperationalTag(): void {
    const value = this.operationalTagSearch().trim();
    this.operationalSearchedTag.set(value || null);
    this.operationalProductSearch.set('');
    this.showAddSku.set(false);
    this.operationalSelections.set(new Map());
    this.operationalSaveError.set(null);
  }

  clearOperationalTagSearch(): void {
    this.operationalTagSearch.set('');
    this.operationalSearchedTag.set(null);
    this.operationalProductSearch.set('');
    this.showAddSku.set(false);
    this.operationalSelections.set(new Map());
    this.operationalSaveError.set(null);
  }

  closePreVarianceModal(): void {
    this.preVarianceModal.set(null);
  }

  closeRecountModal(): void {
    this.recountModal.set(null);
  }

  openTagProductsModal(row: OperationalTagSummaryRow): void {
    this.tagProductsModal.set({
      tagNumber: row.tag,
      products: row.allProducts,
    });
  }

  closeTagProductsModal(): void {
    this.tagProductsModal.set(null);
  }

  toggleAddSku(): void {
    this.showAddSku.update(v => !v);
  }

  confirmProduct(sku: string, quantity: number): void {
    this.operationalSelections.update(m => {
      const next = new Map(m);
      next.set(sku, { decision: 'CONFIRMAR', quantity });
      return next;
    });
    this.operationalSaveError.set(null);
  }

  modifyProduct(sku: string, currentQuantity: number): void {
    this.operationalSelections.update(m => {
      const next = new Map(m);
      next.set(sku, { decision: 'MODIFICAR', quantity: currentQuantity });
      return next;
    });
    this.operationalSaveError.set(null);
  }

  updateDraftQuantity(sku: string, value: string): void {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    this.operationalSelections.update(m => {
      const next = new Map(m);
      const existing = next.get(sku);
      if (existing) {
        next.set(sku, { ...existing, quantity: num });
      }
      return next;
    });
  }

  async saveOperationalValidation(): Promise<void> {
    const modal = this.operationalModal();
    const result = this.tagResult();
    const tagNumeroTag = result?.tagNumeroTag;
    const tagIdTagBackend = result?.tagIdTagBackend ?? null;
    if (!modal || !result || !tagNumeroTag) return;
    if (!this.isAltillosModal()) return;

    const selections = this.operationalSelections();
    if (selections.size === 0) return;

    this.operationalSaving.set(true);
    this.operationalSaveError.set(null);

    const productos = result.products
      .filter(p => selections.has(p.sku))
      .map(p => {
        const sel = selections.get(p.sku)!;
        return {
          sku: p.sku,
          idProductoBackend: p.idProductoBackend ?? null,
          cantidadAnalista: sel.quantity,
          decision: sel.decision,
        };
      });

    const resultado = await this.dashboard.guardarValidacionAltillosTag('ALTILLOS', tagNumeroTag, tagIdTagBackend, productos);

    this.operationalSaving.set(false);

    if (!resultado.ok) {
      this.operationalSaveError.set(resultado.error ?? 'Error al guardar');
      return;
    }

    if (resultado.enviado === false && resultado.error) {
      this.operationalSaveError.set(resultado.error);
      return;
    }

    this.operationalSelections.set(new Map());
  }

  irAHome(): void {
    this.router.navigate(['/home']);
  }
}
