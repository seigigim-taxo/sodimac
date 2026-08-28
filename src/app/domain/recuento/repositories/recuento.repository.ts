import { InjectionToken } from '@angular/core';
import {
  RecuentoProductoAnalista,
  RecuentoAnalista,
} from '../../sincronizacion/models/preparacion.model';

export interface RecuentoParaGuardar {
  jornadaId: number;
  productos: RecuentoProductoParaGuardar[];
}

export interface RecuentoProductoParaGuardar {
  idProductoBackend: number | null;
  sku: string;
  descripcion: string | null;
  stockTeorico: number;
  valorUnitario: number;
  fisicoActual: number;
  diferenciaUnidades: number;
  diferenciaEnCosto: number;
  esPreVariance: boolean;
  estadoRecuento: string;
  ubicaciones: RecuentoUbicacionParaGuardar[];
}

export interface RecuentoUbicacionParaGuardar {
  idTagBackend: number | null;
  numeroTag: number | null;
  zona: string;
  cantidadInventariada: number;
  cantidadRecuento: number | null;
}

export interface RecuentoRepository {
  reemplazarRecuento(input: RecuentoParaGuardar): Promise<void>;
  getRecuento(): Promise<RecuentoAnalista | null>;
}

export const RECUENTO_REPOSITORY_TOKEN = new InjectionToken<RecuentoRepository>('RecuentoRepository');
