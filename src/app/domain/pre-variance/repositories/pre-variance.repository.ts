import { InjectionToken } from '@angular/core';
import {
  PreVarianceProductoAnalista,
  PreVarianceAnalista,
} from '../../sincronizacion/models/preparacion.model';

export interface PreVarianceParaGuardar {
  jornadaId: number;
  productos: PreVarianceProductoParaGuardar[];
}

export interface PreVarianceProductoParaGuardar {
  idProductoBackend: number | null;
  sku: string;
  descripcion: string | null;
  stockTeorico: number;
  valorUnitario: number;
  inventariadoAntesPreVariance: number;
  fisicoVigente: number;
  diferenciaUnidades: number;
  diferenciaEnCosto: number;
  estadoPreVariance: string;
  ubicaciones: PreVarianceUbicacionParaGuardar[];
}

export interface PreVarianceUbicacionParaGuardar {
  idTagBackend: number | null;
  numeroTag: number | null;
  zona: string;
  cantidadInventariada: number;
  cantidadPreVariance: number | null;
}

export interface PreVarianceRepository {
  reemplazarPreVariance(input: PreVarianceParaGuardar): Promise<void>;
  getPreVariance(): Promise<PreVarianceAnalista | null>;
}

export const PRE_VARIANCE_REPOSITORY_TOKEN = new InjectionToken<PreVarianceRepository>('PreVarianceRepository');
