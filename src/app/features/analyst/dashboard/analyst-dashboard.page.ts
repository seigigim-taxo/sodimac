import { Component, inject, signal } from '@angular/core';
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
export class AnalystDashboardPage {
  private router = inject(Router);
  private auth = inject(AuthFacade);

  usuario = this.auth.session;

  etapa1Label = 'ETAPA 1 - Validación operacional';
  etapa1Objetivo = 'Comprobar la ejecución física realizada por Taxo. El Analista puede entrar por TAG o por SKU. Se muestra la cantidad inventariada para confirmarla o modificarla; no se muestra Kardex, teórico ni valorización.';
  etapa1Route = 'ZONIFICACIÓN > ALTILLOS 100% > PDV MÍNIMO 30%';

  etapa2Label = 'ETAPA 2 - Validación contra Kardex';
  etapa2Objetivo = 'Revisar diferencias entre el físico vigente y Kardex. Desde aquí sí se muestra teórico, costo y diferencia valorizada.';
  etapa2Route = 'PRE VARIANCE > RECUENTO';

  etapa1: Stage[] = [
    {
      id: 'altillos',
      label: '1.2',
      title: 'Altillos - 100%',
      description: 'Todos los TAG de Altillo utilizados deben ser revisados.',
      objective: 'Puede validar buscando por TAG o por SKU.',
      status: 'COMPLETADO',
      badge: 'CUMPLE',
      actionLabel: 'Ver validación',
      metrics: [
        { label: 'TAG usados', value: 1, hint: 'Universo a revisar', tone: 'neutral' },
        { label: 'Objetivo mínimo', value: 1, hint: '100%', tone: 'ok' },
        { label: 'Confirmados', value: 1, hint: 'TAG completamente confirmados', tone: 'ok' },
        { label: 'Pendientes', value: 0, hint: 'TAG aún incompletos', tone: 'ok' },
        { label: 'Avance', value: '100%', hint: 'Objetivo cumplido', tone: 'ok' },
      ],
      previewRows: [
        { main: 'TAG 1000', secondary: 'ALTILLO', status: 'COMPLETADO' },
      ],
    },
    {
      id: 'punto-venta',
      label: '1.3',
      title: 'Punto de Venta - mínimo 30%',
      description: 'El Analista elige los TAG a revisar; el sistema controla el mínimo.',
      objective: 'Puede validar buscando por TAG o por SKU.',
      status: 'PENDIENTE',
      badge: '33%',
      actionLabel: 'Abrir validación',
      metrics: [
        { label: 'TAG usados', value: 3, hint: 'Universo a revisar', tone: 'neutral' },
        { label: 'Objetivo mínimo', value: 1, hint: '30%', tone: 'warning' },
        { label: 'Confirmados', value: 1, hint: 'TAG completamente confirmados', tone: 'ok' },
        { label: 'Pendientes', value: 2, hint: 'TAG aún incompletos', tone: 'warning' },
        { label: 'Avance', value: '33%', hint: 'Objetivo aún no cumplido', tone: 'warning' },
      ],
      previewRows: [
        { main: 'TAG 3000', secondary: 'PUNTO DE VENTA', status: 'COMPLETADO' },
        { main: 'TAG 3001', secondary: 'PUNTO DE VENTA', status: 'PENDIENTE' },
        { main: 'TAG 3002', secondary: 'PUNTO DE VENTA', status: 'PENDIENTE' },
      ],
    },
  ];

  etapa2: Stage[] = [
    {
      id: 'pre-variance',
      label: '2.1',
      title: 'Pre Variance',
      description: 'Diferencia valorizada absoluta mayor a $500.000.',
      objective: 'Revisión contra Kardex.',
      status: 'PENDIENTE',
      actionLabel: 'Revisar Pre Variance',
      metrics: [
        { label: 'SKU en Pre Variance', value: 1, hint: 'Diferencia valorizada > $500.000', tone: 'neutral' },
        { label: 'Diferencia valorizada', value: '-$554.168', hint: 'Total con signo', tone: 'danger' },
        { label: 'Revisados / pendientes', value: '0 / 1', hint: 'Revisión Analista Sodimac', tone: 'warning' },
      ],
      previewRows: [
        { main: '7496508', secondary: 'DETERGENTE LIQUIDO HIPO 10L R', status: 'PENDIENTE' },
      ],
    },
    {
      id: 'recuento',
      label: '2.2',
      title: 'Recuento',
      description: 'Por defecto muestra diferencias no abordadas en Pre Variance. Puede ampliar a todas las diferencias.',
      objective: 'El resultado se registra como Conteo 3.',
      status: 'PENDIENTE',
      actionLabel: 'Abrir recuento',
      metrics: [
        { label: 'Restantes', value: 15, hint: 'Diferencias por revisar', tone: 'warning' },
        { label: 'Recontados', value: 0, hint: 'Aún sin recuento', tone: 'neutral' },
        { label: 'Conteo', value: 3, hint: 'Registro resultante', tone: 'purple' },
      ],
      previewRows: [
        { main: '7576331', secondary: 'DETERGENTE EN LAMINAS DEKAP CR', status: 'PENDIENTE' },
        { main: '3948056', secondary: 'DETERGENTE LIQUIDO 10 LTS KW', status: 'PENDIENTE' },
        { main: '7712227', secondary: 'DETERGENTE HIPO 3 L DOYPACK', status: 'PENDIENTE' },
      ],
    },
  ];

  private altillosModalData: OperationalModalData = {
    stageId: 'altillos',
    title: 'Validación operacional - Analista Sodimac',
    subtitle: 'Altillos 100% - busque por TAG o SKU.',
    searchValue: '1000',
    tagTitle: 'TAG 1000 - ALTILLO',
    tagDescription: 'Lista completa de productos contados dentro del TAG.',
    productCount: '1 producto',
    confirmedCount: 1,
    pendingCount: 0,
    products: [
      { sku: '4015134', product: 'SUAVIZANTE ROPA 10 LITROS KW', quantity: 1, newQuantity: 1, status: 'CONFIRMADO' },
    ],
  };

  private puntoVentaModalData: OperationalModalData = {
    stageId: 'punto-venta',
    title: 'Validación operacional - Analista Sodimac',
    subtitle: 'Punto de Venta 30% - busque por TAG o SKU.',
    searchValue: '3001',
    tagTitle: 'TAG 3001 - PUNTO DE VENTA',
    tagDescription: 'Lista completa de productos contados dentro del TAG.',
    productCount: '15 productos',
    confirmedCount: 0,
    pendingCount: 15,
    products: [
      { sku: '3948048', product: 'DETERGENTE LIQUIDO 3 LT KW', quantity: 8, newQuantity: 8, status: 'PENDIENTE' },
      { sku: '3948056', product: 'DETERGENTE LIQUIDO 10 LTS KW', quantity: 34, newQuantity: 34, status: 'PENDIENTE' },
      { sku: '4015134', product: 'SUAVIZANTE ROPA 10 LITROS KW', quantity: 24, newQuantity: 24, status: 'PENDIENTE' },
      { sku: '524875', product: 'SUAVIZANTE LIQUIDO 5LT SOFT.', quantity: 5, newQuantity: 5, status: 'PENDIENTE' },
      { sku: '563864X', product: 'SUAVIZANTE ROPA 3L KW', quantity: 9, newQuantity: 9, status: 'PENDIENTE' },
      { sku: '6009786', product: 'SUAVIZANTE DOWNY BRISA 1L', quantity: 14, newQuantity: 14, status: 'PENDIENTE' },
      { sku: '6009808', product: 'SUAVIZANTE ROPA ADOR 900 ML', quantity: 19, newQuantity: 19, status: 'PENDIENTE' },
    ],
  };

  stageExpanded = signal<string | null>(null);
  operationalModal = signal<OperationalModalData | null>(null);
  preVarianceModal = signal<PreVarianceModalData | null>(null);
  recountModal = signal<RecountModalData | null>(null);
  searchMode = signal<SearchMode>('TAG');
  showAddSku = signal(false);

  private preVarianceModalData: PreVarianceModalData = {
    title: 'Revisión de Pre Variance - Analista Sodimac',
    subtitle: '7496508 - DETERGENTE LIQUIDO HIPO 10L R',
    sku: '7496508',
    product: 'DETERGENTE LIQUIDO HIPO 10L R',
    kardex: 104,
    unitCost: '$10.456',
    currentDifference: '-$554.168',
    locations: [
      { origin: 'Contado', zone: 'PUNTO DE VENTA', tag: '3001', quantity: 20, newQuantity: 20, status: 'CONFIRMADO' },
      { origin: 'Contado', zone: 'PUNTO DE VENTA', tag: '3002', quantity: 31, newQuantity: 31, status: 'CONFIRMADO' },
    ],
  };

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
      this.operationalModal.set(this.altillosModalData);
      this.searchMode.set('TAG');
      this.showAddSku.set(false);
    } else if (stage.id === 'punto-venta') {
      this.operationalModal.set(this.puntoVentaModalData);
      this.searchMode.set('TAG');
      this.showAddSku.set(false);
    } else if (stage.id === 'pre-variance') {
      this.preVarianceModal.set(this.preVarianceModalData);
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
